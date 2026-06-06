import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

const HELMET_CACHE_VERSION = "v1";
const CACHE_MAX_UNUSED_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HELMET_KEY_PATTERN = /^([0-9a-fA-F]{6})-([0-9a-fA-F]{6})$/;

type DecodedPng = {
  width: number;
  height: number;
  pixels: Buffer;
};

export class InvalidHelmetKeyError extends Error {
  constructor(key: string) {
    super(`Invalid helmet color key "${key}".`);
  }
}

export interface IHelmetAssetService {
  cacheControlHeader(): string;
  generatedHelmetPath(key: string): Promise<string>;
}

export class HelmetAssetService implements IHelmetAssetService {
  private readonly cacheDirectory = path.resolve(process.cwd(), "public", "generated", "helmets", HELMET_CACHE_VERSION);
  private readonly templatePath = path.resolve(process.cwd(), "src", "static", "teamHelmetTemplate.png");
  private readonly pendingGenerations = new Map<string, Promise<string>>();
  private lastCleanupAt = 0;

  cacheControlHeader(): string {
    return "public, max-age=31536000, immutable";
  }

  async generatedHelmetPath(key: string): Promise<string> {
    const normalizedKey = this.normalizedKey(key);
    await this.ensureCacheDirectory();
    this.cleanupOldGeneratedHelmets().catch(() => undefined);

    const filePath = this.filePathForKey(normalizedKey);
    if (await this.exists(filePath)) {
      return filePath;
    }

    const pending = this.pendingGenerations.get(normalizedKey);
    if (pending) {
      return pending;
    }

    const generated = this.generateHelmet(normalizedKey, filePath).finally(() => {
      this.pendingGenerations.delete(normalizedKey);
    });
    this.pendingGenerations.set(normalizedKey, generated);
    return generated;
  }

  private normalizedKey(key: string): string {
    const match = HELMET_KEY_PATTERN.exec(key);
    if (!match) {
      throw new InvalidHelmetKeyError(key);
    }
    return `${match[1].toLowerCase()}-${match[2].toLowerCase()}`;
  }

  private filePathForKey(key: string): string {
    const filePath = path.resolve(this.cacheDirectory, `${key}.png`);
    if (path.dirname(filePath) !== this.cacheDirectory) {
      throw new InvalidHelmetKeyError(key);
    }
    return filePath;
  }

  private async generateHelmet(key: string, filePath: string): Promise<string> {
    const [primaryHex, secondaryHex] = key.split("-");
    const primary = this.hexToRgb(primaryHex);
    const secondary = this.hexToRgb(secondaryHex);
    const template = decodePng(await fs.readFile(this.templatePath));
    const recolored = recolorHelmet(template, primary, secondary);
    const encoded = encodePng(recolored);
    const tempPath = path.resolve(this.cacheDirectory, `${key}.${process.pid}.${Date.now()}.tmp`);
    if (path.dirname(tempPath) !== this.cacheDirectory) {
      throw new InvalidHelmetKeyError(key);
    }
    await fs.writeFile(tempPath, encoded);
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      if (await this.exists(filePath)) {
        return filePath;
      }
      throw error;
    }
    return filePath;
  }

  private hexToRgb(hex: string): [number, number, number] {
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  private async ensureCacheDirectory(): Promise<void> {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async cleanupOldGeneratedHelmets(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastCleanupAt = now;

    let entries: string[];
    try {
      entries = await fs.readdir(this.cacheDirectory);
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      if (!/^[0-9a-f]{6}-[0-9a-f]{6}\.png$/.test(entry)) {
        return;
      }
      const filePath = path.resolve(this.cacheDirectory, entry);
      if (path.dirname(filePath) !== this.cacheDirectory) {
        return;
      }
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || now - stat.mtimeMs < CACHE_MAX_UNUSED_AGE_MS) {
        return;
      }
      await fs.rm(filePath, { force: true });
    }));
  }
}

export function helmetColorKey(primaryColor: string, secondaryColor: string): string | null {
  const primary = normalizedHex(primaryColor);
  const secondary = normalizedHex(secondaryColor);
  return primary && secondary ? `${primary}-${secondary}` : null;
}

function normalizedHex(value: string): string | null {
  const normalized = value.trim().replace(/^#/, "").toLowerCase();
  return /^[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

function decodePng(buffer: Buffer): DecodedPng {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("Helmet template is not a valid PNG.");
  }

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = buffer.subarray(dataStart, dataEnd);
    offset = dataEnd + 4;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width <= 0 || height <= 0 || bitDepth !== 8 || colorType !== 6) {
    throw new Error("Helmet template must be an 8-bit RGBA PNG.");
  }

  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const pixels = Buffer.alloc(rowLength * height);
  let sourceOffset = 0;

  for (let row = 0; row < height; row += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = row * rowLength;
    for (let column = 0; column < rowLength; column += 1) {
      const raw = inflated[sourceOffset + column];
      const left = column >= bytesPerPixel ? pixels[rowStart + column - bytesPerPixel] : 0;
      const up = row > 0 ? pixels[rowStart - rowLength + column] : 0;
      const upLeft = row > 0 && column >= bytesPerPixel ? pixels[rowStart - rowLength + column - bytesPerPixel] : 0;
      pixels[rowStart + column] = unfilterByte(filter, raw, left, up, upLeft);
    }
    sourceOffset += rowLength;
  }

  return { width, height, pixels };
}

function encodePng(image: DecodedPng): Buffer {
  const rowLength = image.width * 4;
  const scanlines = Buffer.alloc((rowLength + 1) * image.height);
  for (let row = 0; row < image.height; row += 1) {
    const scanlineStart = row * (rowLength + 1);
    scanlines[scanlineStart] = 0;
    image.pixels.copy(scanlines, scanlineStart + 1, row * rowLength, (row + 1) * rowLength);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function unfilterByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paeth(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter type ${filter}.`);
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) {
    return left;
  }
  return upDistance <= upLeftDistance ? up : upLeft;
}

function recolorHelmet(template: DecodedPng, primary: [number, number, number], secondary: [number, number, number]): DecodedPng {
  const pixels = Buffer.from(template.pixels);
  const primaryHsl = rgbToHsl(primary[0], primary[1], primary[2]);
  const secondaryHsl = rgbToHsl(secondary[0], secondary[1], secondary[2]);

  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] === 0) {
      continue;
    }
    const [hue, saturation, lightness] = rgbToHsl(pixels[index], pixels[index + 1], pixels[index + 2]);
    let replacement: [number, number, number] | null = null;
    if (isPrimaryMarker(hue, saturation, lightness)) {
      replacement = recolorPixel(primaryHsl, lightness, 0.5);
    } else if (isSecondaryMarker(hue, saturation, lightness)) {
      replacement = recolorPixel(secondaryHsl, lightness, 0.48);
    }
    if (replacement) {
      pixels[index] = replacement[0];
      pixels[index + 1] = replacement[1];
      pixels[index + 2] = replacement[2];
    }
  }

  return { ...template, pixels };
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) {
    return [0, 0, lightness];
  }

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue = 0;
  if (max === r) {
    hue = (g - b) / delta + (g < b ? 6 : 0);
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }
  return [hue * 60, saturation, lightness];
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = hue / 360;
  if (saturation === 0) {
    const value = Math.round(lightness * 255);
    return [value, value, value];
  }
  const q = lightness < 0.5
    ? lightness * (1 + saturation)
    : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, h) * 255),
    Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
  ];
}

function isPrimaryMarker(hue: number, saturation: number, lightness: number): boolean {
  return hue >= 292 && hue <= 330 && saturation >= 0.28 && lightness >= 0.18;
}

function isSecondaryMarker(hue: number, saturation: number, lightness: number): boolean {
  return hue >= 174 && hue <= 196 && saturation >= 0.28 && lightness >= 0.16;
}

function recolorPixel(targetHsl: [number, number, number], templateLightness: number, baseLightness: number): [number, number, number] {
  const [hue, saturation, targetLightness] = targetHsl;
  const adjustedLightness = Math.max(0, Math.min(1, targetLightness * 0.68 + templateLightness * 0.52 - baseLightness * 0.2));
  return hslToRgb(hue, saturation, adjustedLightness);
}

const crcTable = new Uint32Array(256);
for (let index = 0; index < crcTable.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function CreateHelmetAssetService(): IHelmetAssetService {
  return new HelmetAssetService();
}
