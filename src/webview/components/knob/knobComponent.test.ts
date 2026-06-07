import KnobComponent from "./knobComponent";

describe("knobComponent", () => {
  let mount: HTMLDivElement;
  let onChange: jest.Mock;
  let knob: KnobComponent;

  beforeEach(() => {
    mount = document.createElement("div");
    mount.id = "knobMount";
    document.body.appendChild(mount);
    onChange = jest.fn();
    knob = new KnobComponent("#knobMount", 50, onChange, {
      min: 0,
      max: 100,
      step: 1,
      compact: true,
      centerMode: "playPause",
    });
  });

  afterEach(() => {
    knob.dispose();
    document.body.removeChild(mount);
  });

  test("renders knob hit area at requested size", () => {
    const hit = mount.querySelector(".earEqKnob__hit") as HTMLElement;
    expect(hit.style.width).toBe("56px");
  });

  test("set value clamps to min/max", () => {
    knob.value = 150;
    expect(knob.value).toBe(100);
    knob.value = -10;
    expect(knob.value).toBe(0);
  });

  test("setPlaying toggles center icon", () => {
    const icon = mount.querySelector(".earEqKnob__centerIcon");
    expect(icon?.innerHTML).toContain("8 5v14");
    knob.setPlaying(true);
    expect(icon?.innerHTML).toContain("6 5h4");
  });

  test("disabled prevents interaction styling", () => {
    knob.disabled = true;
    expect(mount.querySelector(".earEqKnob--disabled")).toBeTruthy();
  });
});
