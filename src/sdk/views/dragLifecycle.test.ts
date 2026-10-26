import { createPcmSource } from "../core";
import { createLivePanel } from "./livePanel";

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test.each(["dispose", "reset", "suspend"] as const)(
  "%s ends active row and column drags without waiting for mouseup",
  (action) => {
    for (const selector of ["#liveResizeHandle", "[data-gonio-col-handle]"]) {
      const source = createPcmSource({ sampleRate: 48000 });
      const container = document.createElement("div");
      document.body.append(container);
      const view = createLivePanel(container, { source });
      const add = jest.spyOn(document, "addEventListener");
      const remove = jest.spyOn(document, "removeEventListener");
      container
        .querySelector(selector)
        .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      const dragListeners = add.mock.calls.filter(
        ([name]) => name === "mousemove" || name === "mouseup",
      );
      view[action]();
      try {
        expect(dragListeners).toHaveLength(2);
        for (const [name, listener] of dragListeners) {
          expect(
            remove.mock.calls.some(
              ([removedName, removed]) =>
                removedName === name && removed === listener,
            ),
          ).toBe(true);
        }
      } finally {
        document.dispatchEvent(new MouseEvent("mouseup"));
        view.dispose();
        source.dispose();
        container.remove();
        add.mockRestore();
        remove.mockRestore();
      }
    }
  },
);
