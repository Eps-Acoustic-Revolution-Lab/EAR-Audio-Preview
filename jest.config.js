module.exports = {
  automock: false,
  rootDir: "src",
  testEnvironment: "jsdom",
  setupFiles: ["jest-canvas-mock", "<rootDir>/__mocks__/jestSetup.js"],
  moduleNameMapper: {
    "\\.css$": "<rootDir>/__mocks__/styleMock.js",
    "^loudness-worklet$": "<rootDir>/__mocks__/loudness-worklet.ts",
    "^ebur128-wasm$": "<rootDir>/__mocks__/ebur128-wasm.ts",
  },
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
};
