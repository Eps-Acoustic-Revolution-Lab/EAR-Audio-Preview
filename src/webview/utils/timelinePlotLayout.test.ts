import {
  TIMELINE_PLOT_PAD_LEFT,
  TIMELINE_PLOT_PAD_RIGHT,
  plotTimeSecFromClientX,
  timeSecToContainerPercent,
  timeSecToPlotX,
} from "./timelinePlotLayout";

describe("timelinePlotLayout", () => {
  const w = 400;
  const padL = TIMELINE_PLOT_PAD_LEFT;
  const padR = TIMELINE_PLOT_PAD_RIGHT;

  test("timeSecToPlotX respects plot padding", () => {
    expect(timeSecToPlotX(0, 0, 100, w, padL, padR)).toBeCloseTo(padL, 5);
    expect(timeSecToPlotX(100, 0, 100, w, padL, padR)).toBeCloseTo(w - padR, 5);
    expect(timeSecToPlotX(50, 0, 100, w, padL, padR)).toBeCloseTo(
      padL + (w - padL - padR) * 0.5,
      5,
    );
  });

  test("timeSecToContainerPercent matches plot X over width", () => {
    const x = timeSecToPlotX(25, 0, 100, w, padL, padR);
    expect(timeSecToContainerPercent(25, 0, 100, w, padL, padR)).toBeCloseTo(
      (x / w) * 100,
      5,
    );
  });

  test("plotTimeSecFromClientX inverts timeSecToPlotX", () => {
    const rect = { left: 100, width: w, top: 0, height: 0 } as DOMRect;
    const sec = 42;
    const x = timeSecToPlotX(sec, 0, 100, w, padL, padR);
    const clientX = rect.left + x;
    expect(
      plotTimeSecFromClientX(clientX, rect, 0, 100, padL, padR),
    ).toBeCloseTo(sec, 5);
  });
});
