import HarmonicTimeline from "./harmonicTimeline";
import type SequenceFeatureService from "../../services/sequenceFeatureService";
import type AnalyzeSettingsService from "../../services/analyzeSettingsService";

function fixture(analyze: jest.Mock, sampleRate = 44100) {
  const mount = document.createElement("div");
  const settings = Object.assign(new EventTarget(), { minTime: 0, maxTime: 1 });
  const component = new HarmonicTimeline(
    mount,
    { analyzeHarmonics: analyze } as unknown as SequenceFeatureService,
    settings as AnalyzeSettingsService,
    1,
    sampleRate,
  );
  return { mount, component, button: mount.querySelector("button")! };
}

test("does not analyze until requested and permits retry after a failed analysis", async () => {
  const analyze = jest.fn().mockRejectedValue(new Error("unavailable"));
  const { mount, component, button } = fixture(analyze);
  expect(analyze).not.toHaveBeenCalled();
  button.click();
  expect(button.disabled).toBe(true);
  await Promise.resolve();
  await Promise.resolve();
  expect(mount.textContent).toContain("Try again");
  expect(button.disabled).toBe(false);
  component.dispose();
  expect(mount.children).toHaveLength(0);
});

test("unsupported audio explains availability without sending a request", () => {
  const analyze = jest.fn();
  const { mount, component, button } = fixture(analyze, 96000);
  expect(button.disabled).toBe(true);
  expect(mount.textContent).toContain("kHz");
  button.click();
  expect(analyze).not.toHaveBeenCalled();
  component.dispose();
});

test("late completion after disposal cannot resurrect the timeline", async () => {
  let finish: (value: unknown) => void = () => {};
  const analyze = jest.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { mount, component, button } = fixture(analyze);
  button.click();
  component.dispose();
  finish(null);
  await Promise.resolve();
  await Promise.resolve();
  expect(mount.children).toHaveLength(0);
});
