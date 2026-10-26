export const sdkVersion = "0.1.0";
export const sdkPackages = {
  core: "src/sdk/core.ts",
  "web-audio": "src/sdk/webAudio.ts",
  dsp: "src/sdk/dsp.ts",
  "level-meter": "src/sdk/views/levelMeter.ts",
  spectrum: "src/sdk/views/spectrum.ts",
  "stereo-field": "src/sdk/views/stereoField.ts",
  "phase-correlation": "src/sdk/views/phaseCorrelation.ts",
  descriptors: "src/sdk/views/descriptors.ts",
  "live-panel": "src/sdk/views/livePanel.ts",
};
export const sdkName = (name) => `@ear-audio/${name}`;
