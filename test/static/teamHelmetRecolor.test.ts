import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

type Listener = () => void;

class FakeHelmet {
  dataset: Record<string, string>;
  style: Record<string, string> = {};
  private listeners = new Map<string, Listener>();
  private currentSrc = "/teamHelmetTemplate.png";

  constructor(source = "/generated/helmets/v1/690014-f1f2f3.png") {
    this.dataset = { generatedHelmetSrc: source };
  }

  get src(): string {
    return this.currentSrc;
  }

  set src(value: string) {
    this.currentSrc = value;
    if (value.startsWith("/generated/helmets/v1/")) {
      setTimeout(() => this.listeners.get("load")?.(), 0);
    }
  }

  addEventListener(eventName: string, listener: Listener): void {
    this.listeners.set(eventName, listener);
  }
}

function waitForLoad(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("teamHelmetRecolor", () => {
  it("waits for visible helmets, then reuses generated helmet URLs by source", async () => {
    const script = fs.readFileSync(path.join(process.cwd(), "src/static/teamHelmetRecolor.js"), "utf8");
    const helmets = [new FakeHelmet(), new FakeHelmet(), new FakeHelmet()];
    const listeners = new Map<string, (event?: { target: { querySelectorAll: () => FakeHelmet[] } }) => void>();
    const intersectionObservers: FakeIntersectionObserver[] = [];

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
      querySelectorAll: jest.fn(() => helmets),
    };

    vm.runInNewContext(script, {
      document,
      jest,
      setTimeout,
      window,
    });

    listeners.get("DOMContentLoaded")?.();

    const debug = window as {
      __teamHelmetRecolor: {
        stats: { cacheHits: number; observedHelmets: number; visibleHelmets: number; requestedHelmets: number };
        cacheSize: () => number;
      };
    };

    expect(intersectionObservers).toHaveLength(1);
    expect(intersectionObservers[0].observed).toHaveLength(3);
    expect(debug.__teamHelmetRecolor.stats.observedHelmets).toBe(3);
    expect(debug.__teamHelmetRecolor.stats.requestedHelmets).toBe(0);

    intersectionObservers[0].trigger(helmets);
    await waitForLoad();

    expect(helmets.every((helmet) => helmet.src === "/generated/helmets/v1/690014-f1f2f3.png")).toBe(true);
    expect(helmets.every((helmet) => helmet.dataset.recoloredHelmet === "true")).toBe(true);
    expect(debug.__teamHelmetRecolor.stats.requestedHelmets).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.cacheHits).toBe(2);
    expect(debug.__teamHelmetRecolor.cacheSize()).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.visibleHelmets).toBe(3);

    const swappedHelmet = new FakeHelmet();
    listeners.get("htmx:afterSwap")?.({
      target: {
        querySelectorAll: () => [swappedHelmet],
      },
    });

    expect(intersectionObservers[0].observed).toContain(swappedHelmet);
    intersectionObservers[0].trigger([swappedHelmet]);

    expect(swappedHelmet.src).toBe("/generated/helmets/v1/690014-f1f2f3.png");
    expect(debug.__teamHelmetRecolor.stats.requestedHelmets).toBe(1);
    expect(debug.__teamHelmetRecolor.stats.cacheHits).toBe(3);
  });
});
