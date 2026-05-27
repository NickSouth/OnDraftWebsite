(() => {
  const TEMPLATE_SRC = "/teamHelmetTemplate.png";
  const helmetImageCache = new Map();
  const stats = {
    templateReads: 0,
    generatedImages: 0,
    cacheHits: 0,
    observedHelmets: 0,
    visibleHelmets: 0,
  };
  const loadedTemplate = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = TEMPLATE_SRC;
  });
  let loadedTemplatePixels = null;

  function templatePixels() {
    loadedTemplatePixels ??= loadedTemplate.then((template) => {
      const canvas = document.createElement("canvas");
      canvas.width = template.naturalWidth || template.width;
      canvas.height = template.naturalHeight || template.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        throw new Error("Canvas context unavailable.");
      }
      context.drawImage(template, 0, 0);
      stats.templateReads += 1;
      return {
        width: canvas.width,
        height: canvas.height,
        pixels: context.getImageData(0, 0, canvas.width, canvas.height),
      };
    });
    return loadedTemplatePixels;
  }

  function parseHexColor(value) {
    const normalized = typeof value === "string" ? value.trim().replace(/^#/, "") : "";
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return null;
    }
    return [
      Number.parseInt(normalized.slice(0, 2), 16),
      Number.parseInt(normalized.slice(2, 4), 16),
      Number.parseInt(normalized.slice(4, 6), 16),
    ];
  }

  function rgbToHsl(red, green, blue) {
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

  function hueToRgb(p, q, t) {
    let normalized = t;
    if (normalized < 0) normalized += 1;
    if (normalized > 1) normalized -= 1;
    if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
    if (normalized < 1 / 2) return q;
    if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
    return p;
  }

  function hslToRgb(hue, saturation, lightness) {
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

  function isPrimaryMarker(hue, saturation, lightness) {
    return hue >= 292 && hue <= 330 && saturation >= 0.28 && lightness >= 0.18;
  }

  function isSecondaryMarker(hue, saturation, lightness) {
    return hue >= 174 && hue <= 196 && saturation >= 0.28 && lightness >= 0.16;
  }

  function recolorPixel(targetHsl, templateLightness, baseLightness) {
    const [hue, saturation, targetLightness] = targetHsl;
    const adjustedLightness = Math.max(0, Math.min(1, targetLightness * 0.68 + templateLightness * 0.52 - baseLightness * 0.2));
    return hslToRgb(hue, saturation, adjustedLightness);
  }

  function colorCacheKey(primary, secondary) {
    return `${primary.join(",")}:${secondary.join(",")}`;
  }

  function cloneTemplatePixels(context, templatePixels) {
    const pixels = typeof context.createImageData === "function"
      ? context.createImageData(templatePixels.width, templatePixels.height)
      : new ImageData(templatePixels.width, templatePixels.height);
    pixels.data.set(templatePixels.pixels.data);
    return pixels;
  }

  async function generateRecoloredHelmet(primary, secondary) {
    const primaryHsl = rgbToHsl(primary[0], primary[1], primary[2]);
    const secondaryHsl = rgbToHsl(secondary[0], secondary[1], secondary[2]);
    const sourcePixels = await templatePixels();
    const canvas = document.createElement("canvas");
    canvas.width = sourcePixels.width;
    canvas.height = sourcePixels.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Canvas context unavailable.");
    }

    const pixels = cloneTemplatePixels(context, sourcePixels);
    for (let index = 0; index < pixels.data.length; index += 4) {
      if (pixels.data[index + 3] === 0) {
        continue;
      }
      const [hue, saturation, lightness] = rgbToHsl(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
      let replacement;
      if (isPrimaryMarker(hue, saturation, lightness)) {
        replacement = recolorPixel(primaryHsl, lightness, 0.5);
      } else if (isSecondaryMarker(hue, saturation, lightness)) {
        replacement = recolorPixel(secondaryHsl, lightness, 0.48);
      }
      if (replacement) {
        pixels.data[index] = replacement[0];
        pixels.data[index + 1] = replacement[1];
        pixels.data[index + 2] = replacement[2];
      }
    }
    context.putImageData(pixels, 0, 0);
    stats.generatedImages += 1;
    return canvas.toDataURL("image/png");
  }

  function cachedHelmetSource(primary, secondary) {
    const key = colorCacheKey(primary, secondary);
    const cached = helmetImageCache.get(key);
    if (cached) {
      stats.cacheHits += 1;
      return cached;
    }

    const generated = generateRecoloredHelmet(primary, secondary).catch((error) => {
      helmetImageCache.delete(key);
      throw error;
    });
    helmetImageCache.set(key, generated);
    return generated;
  }

  async function recolorHelmet(element) {
    if (element.dataset.recoloredHelmet === "true") {
      return;
    }
    const primary = parseHexColor(element.dataset.primaryColor) || [17, 17, 17];
    const secondary = parseHexColor(element.dataset.secondaryColor) || [248, 250, 252];
    element.src = await cachedHelmetSource(primary, secondary);
    element.dataset.recoloredHelmet = "true";
    element.style.opacity = "1";
  }

  const helmetObserver = "IntersectionObserver" in window
    ? new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        helmetObserver.unobserve(entry.target);
        stats.visibleHelmets += 1;
        recolorHelmet(entry.target).catch(() => {
          entry.target.style.opacity = "1";
        });
      });
    }, { rootMargin: "300px 0px" })
    : null;

  function watchHelmet(element) {
    if (element.dataset.recoloredHelmet === "true" || element.dataset.helmetObserved === "true") {
      return;
    }
    if (!helmetObserver) {
      stats.visibleHelmets += 1;
      recolorHelmet(element).catch(() => {
        element.style.opacity = "1";
      });
      return;
    }
    element.dataset.helmetObserved = "true";
    stats.observedHelmets += 1;
    helmetObserver.observe(element);
  }

  function recolorHelmets(root = document) {
    root.querySelectorAll("[data-team-helmet]").forEach((element) => {
      watchHelmet(element);
    });
  }

  document.addEventListener("DOMContentLoaded", () => recolorHelmets());
  document.body.addEventListener("htmx:afterSwap", (event) => recolorHelmets(event.target));
  window.__teamHelmetRecolor = {
    recolorHelmets,
    stats,
    cacheSize: () => helmetImageCache.size,
  };
})();
