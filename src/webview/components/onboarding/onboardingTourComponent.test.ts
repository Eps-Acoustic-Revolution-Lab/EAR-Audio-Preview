import OnboardingTourComponent from "./onboardingTourComponent";

/**
 * Behavior anchors for the cold-start tour: step filtering by present
 * anchors, forward/back navigation, and the finished callback contract
 * (fired exactly once on Done, Skip or Escape).
 */

describe("OnboardingTourComponent", () => {
  let onFinished: jest.Mock;
  let tour: OnboardingTourComponent;

  const steps = [
    { target: "#anchorA", title: "A", body: "about a" },
    { target: "#missingAnchor", title: "Ghost", body: "never shown" },
    { target: "#anchorB", title: "B", body: "about b" },
    { target: null, title: "Fin", body: "closing card" },
  ];

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="anchorA"></div>
      <div id="anchorB"></div>
      <div id="tourMount"></div>
    `;
    onFinished = jest.fn();
    tour = new OnboardingTourComponent("#tourMount", steps, onFinished);
  });

  afterEach(() => {
    tour.dispose();
  });

  const overlay = () =>
    document.querySelector(".onboardingTour") as HTMLElement;
  const title = () =>
    document.querySelector(".onboardingTour__title") as HTMLElement;
  const next = () =>
    document.querySelector(".js-tourNext") as HTMLButtonElement;
  const back = () =>
    document.querySelector(".js-tourBack") as HTMLButtonElement;
  const skip = () =>
    document.querySelector(".js-tourSkip") as HTMLButtonElement;

  test("hidden until started; start shows the first present anchor", () => {
    expect(overlay().hasAttribute("hidden")).toBe(true);
    tour.start();
    expect(overlay().hasAttribute("hidden")).toBe(false);
    expect(tour.active).toBe(true);
    expect(title().textContent).toBe("A");
  });

  test("steps with missing anchors are dropped from the flow", () => {
    tour.start();
    next().click();
    // "#missingAnchor" is skipped — second visible step is B.
    expect(title().textContent).toBe("B");
    expect(document.querySelectorAll(".onboardingTour__dot").length).toBe(3);
  });

  test("back returns to the previous step; Done finishes exactly once", () => {
    tour.start();
    next().click();
    back().click();
    expect(title().textContent).toBe("A");
    next().click();
    next().click();
    expect(next().textContent).toBe("Done");
    next().click();
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(tour.active).toBe(false);
    expect(overlay().hasAttribute("hidden")).toBe(true);
  });

  test("skip finishes immediately and marks the tour as seen", () => {
    tour.start();
    skip().click();
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(tour.active).toBe(false);
  });

  test("Escape closes the tour and fires the finished callback", () => {
    tour.start();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onFinished).toHaveBeenCalledTimes(1);
    expect(tour.active).toBe(false);
  });

  test("Escape already consumed by an overlay does not close the tour", () => {
    tour.start();
    const ev = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    ev.preventDefault(); // simulates an overlay's own Esc handler running first
    document.dispatchEvent(ev);
    expect(onFinished).not.toHaveBeenCalled();
    expect(tour.active).toBe(true);
  });

  test("restart after finish works (manual replay via the ? button)", () => {
    tour.start();
    skip().click();
    tour.start();
    expect(tour.active).toBe(true);
    expect(title().textContent).toBe("A");
  });

  test("pane step advances when the expected pane event fires", () => {
    tour.dispose();
    tour = new OnboardingTourComponent(
      "#tourMount",
      [
        {
          target: "#anchorA",
          title: "OpenIt",
          body: "click",
          advanceOn: { kind: "pane", pane: "stft" },
        },
        { target: "#anchorB", title: "After", body: "done" },
      ],
      onFinished,
    );
    tour.start();
    expect(overlay().classList.contains("onboardingTour--interactive")).toBe(
      true,
    );
    document.dispatchEvent(
      new CustomEvent("workspace-active-pane", { detail: { pane: "other" } }),
    );
    expect(title().textContent).toBe("OpenIt");
    document.dispatchEvent(
      new CustomEvent("workspace-active-pane", { detail: { pane: "stft" } }),
    );
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(title().textContent).toBe("After");
        expect(
          overlay().classList.contains("onboardingTour--interactive"),
        ).toBe(false);
        resolve();
      });
    });
  });

  test("visible step advances once the watched element appears", () => {
    jest.useFakeTimers();
    try {
      tour.dispose();
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="lateOverlay" hidden style="width:100px;height:50px"></div>',
      );
      const late = document.getElementById("lateOverlay") as HTMLElement;
      late.getBoundingClientRect = () =>
        ({ width: 100, height: 50, top: 0, left: 0 }) as DOMRect;
      tour = new OnboardingTourComponent(
        "#tourMount",
        [
          {
            target: null,
            title: "PressIt",
            body: "press the key",
            advanceOn: { kind: "visible", selector: "#lateOverlay" },
          },
          { target: "#anchorB", title: "After", body: "done" },
        ],
        onFinished,
      );
      tour.start();
      jest.advanceTimersByTime(500);
      expect(title().textContent).toBe("PressIt");
      late.removeAttribute("hidden");
      jest.advanceTimersByTime(500);
      expect(title().textContent).toBe("After");
    } finally {
      jest.useRealTimers();
    }
  });

  test("closed step advances when the open overlay disappears again", () => {
    jest.useFakeTimers();
    try {
      tour.dispose();
      document.body.insertAdjacentHTML(
        "beforeend",
        '<div id="openOverlay"></div>',
      );
      const open = document.getElementById("openOverlay") as HTMLElement;
      open.getBoundingClientRect = () =>
        ({ width: 100, height: 50, top: 0, left: 0 }) as DOMRect;
      tour = new OnboardingTourComponent(
        "#tourMount",
        [
          {
            target: "#anchorA",
            title: "CloseIt",
            body: "close the overlay",
            advanceOn: { kind: "closed", selector: "#openOverlay" },
          },
          { target: "#anchorB", title: "After", body: "done" },
        ],
        onFinished,
      );
      tour.start();
      jest.advanceTimersByTime(500);
      expect(title().textContent).toBe("CloseIt");
      open.setAttribute("hidden", "");
      jest.advanceTimersByTime(500);
      expect(title().textContent).toBe("After");
    } finally {
      jest.useRealTimers();
    }
  });

  test("custom flip step baselines on entry and advances on change", () => {
    jest.useFakeTimers();
    try {
      tour.dispose();
      let label = "L";
      let initial: string | null = null;
      const advanceOn = {
        kind: "custom" as const,
        check: () => {
          if (initial === null) {
            initial = label;
            return false;
          }
          return label !== initial;
        },
        reset: () => {
          initial = null;
        },
      };
      tour = new OnboardingTourComponent(
        "#tourMount",
        [
          {
            target: "#anchorA",
            title: "FlipIt",
            body: "right-click",
            advanceOn,
          },
          { target: "#anchorB", title: "After", body: "done" },
        ],
        onFinished,
      );
      tour.start();
      jest.advanceTimersByTime(500);
      expect(title().textContent).toBe("FlipIt");
      label = "M";
      jest.advanceTimersByTime(500);
      expect(title().textContent).toBe("After");
    } finally {
      jest.useRealTimers();
    }
  });
});
