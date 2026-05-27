import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

type FakeHelmet = {
  dataset: Record<string, string>;
  src: string;
  style: Record<string, string>;
};

function waitForRecolor(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createHelmet(primaryColor = "#690014", secondaryColor = "#F1F2F3"): FakeHelmet {
  return {
    dataset: { primaryColor, secondaryColor },
    src: "/teamHelmetTemplate.png",
    style: {},
  };
}

describe("teamHelmetRecolor", () => {
  it("waits for visible helmets, then reuses generated images by color pair", async () => {
    const script = fs.readFileSync(path.join(process.cwd(), "src/static/teamHelmetRecolor.js"), "utf8");
    const helmets = [createHelmet(), createHelmet(), createHelmet()];
    const listeners = new Map<string, (event?: { target: { querySelectorAll: () => FakeHelmet[] } }) => void>();
    const intersectionObservers: FakeIntersectionObserver[] = [];
    const templatePixels = new Uint8ClampedArray([
      180, 30, 140, 255,
      30, 180, 190, 255,
      0, 0, 0, 0,
      255, 255, 255, 255,
    ]);

    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = 2;
      naturalHeight = 2;
      width = 2;
      height = 2;

      set src(_value: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }

    class FakeIntersectionObserver {
      observed: FakeHelmet[] = [];

      constructor(
        private readonly callback: (entries: Array<{ isIntersecting: boolean; target: FakeHelmet }>) => void,
      ) {
        intersectionObservers.push(this);
      }

      observe(element: FakeHelmet): void {
        this.observed.push(element);
      }

      unobserve(element: FakeHelmet): void {
        this.observed = this.observed.filter((candidate) => candidate !== element);
      }

      trigger(elements: FakeHelmet[]): void {
        this.callback(elements.map((target) => ({ isIntersecting: true, target })));
      }
    }

    const canvasContext = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(templatePixels) })),
      createImageData: jest.fn((width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
      })),
      putImageData: jest.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => canvasContext),
      toDataURL: jest.fn(() => "data:image/png;base64,recolored-helmet"),
    };
    const window = { IntersectionObserver: FakeIntersectionObserver };
    const document = {
      body: {
        addEventListener: jest.fn((eventName: string, listener: (event: { target: { querySelectorAll: () => FakeHelmet[] } }) => void) => {
          listeners.set(eventName, listener);
        }),
      },
      addEventListener: jest.fn((eventName: string, listener: () => void) => {
        listeners.set(eventName, listener);
      }),
      createElement: jest.fn(() => canvas),
      querySelectorAll: jest.fn(() => helmets),
    };

    vm.runInNewContext(script, {
      Image: FakeImage,
      document,
      jest,
      setTimeout,
      Uint8ClampedArray,
      window,
    });

    listeners.get("DOMContentLoaded")?.();
    await waitForRecolor();

    const debug = window as {
      __teamHelmetRecolor: {
        stats: { templateReads: number; generatedImages: number; cacheHits: number; observedHelmets: number; visibleHelmets: number };
        cacheSize: () => number;
      };
    };

    expect(intersectionObservers).toHaveLength(1);
    expect(intersectionObservers[0].observed).toHaveLength(3);
    expect(debug.__teamHelmetRecolor.stats.templateReads).toBe(0);
    expect(debug.__teamHelmetRecolor.stats.generatedImages).toBe(0);
    expect(debug.__teamHelmetRecolor.stats.observedHelmets).toBe(3);

    intersectionObservers[0].trigger(helmets);
    await waitForRecolor();
    await waitForRecolor();

    expect(helmets.every((helmet) => helmet.src === "data:image/png;base64,recolored-helmet")).toBe(true);
    expect(helmets.every((helmet) => helmet.dataset.recoloredHelmet === "true")).toBe(true);
    expect(debug.__teamHelmetRecolor.stats.templateReads).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.generatedImages).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.cacheHits).toBe(2);
    expect(debug.__teamHelmetRecolor.cacheSize()).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.visibleHelmets).toBe(3);

    const swappedHelmet = createHelmet();
    listeners.get("htmx:afterSwap")?.({
      target: {
        querySelectorAll: () => [swappedHelmet],
      },
    });

    expect(intersectionObservers[0].observed).toContain(swappedHelmet);
    intersectionObservers[0].trigger([swappedHelmet]);
    await waitForRecolor();

    expect(swappedHelmet.src).toBe("data:image/png;base64,recolored-helmet");
    expect(debug.__teamHelmetRecolor.stats.generatedImages).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.cacheHits).toBe(3);
  });
});
