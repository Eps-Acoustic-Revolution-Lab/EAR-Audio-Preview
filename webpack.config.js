"use strict";
const path = require("path");
const webpack = require("webpack");
const essentiaAlias = {
  "essentia.js$": path.resolve(__dirname, "scripts/essentia-runtime.cjs"),
};

const { writeLoudnessWorkletAssets } = require("./scripts/loudness-worklet-source.cjs");

/** Emit both DSP entry points before normal and watch builds; extraction errors fail the build. */
class ExtractLoudnessWorkletPlugin {
  apply(compiler) {
    const emit = () => writeLoudnessWorkletAssets(__dirname);
    compiler.hooks.beforeRun.tap("ExtractLoudnessWorkletPlugin", emit);
    compiler.hooks.watchRun.tap("ExtractLoudnessWorkletPlugin", emit);
  }
}

const extensionConfig = {
  target: "node", // vscode extensions run in a Node.js-context 📖 -> https://webpack.js.org/configuration/node/

  entry: "./src/extension.ts", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 -> https://github.com/TypeStrong/ts-loader
    extensions: [".ts", ".js"],
    alias: essentiaAlias,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
};

const webviewConfig = {
  target: "web",

  entry: {sequenceWorker: "./src/webview/services/sequenceWorker.ts", audioPreview: "./src/webview/index.ts", comparison: "./src/webview/comparison/index.ts", comparisonWorker: "./src/webview/comparison/analysisWorker.ts", aacDecoderWorker: "./src/webview/decoders/aacDecoderWorker.ts"},
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".js"],
    fallback: {
      assert: require.resolve("assert"), // Ooura(fft lib) contains assert
      path: require.resolve("path-browserify"),
    },
    alias: {
      ...essentiaAlias,
      "./ics$": path.resolve(__dirname, "third-party/aac/ics.js"),
      "av$": path.resolve(__dirname, "scripts/aurora-runtime.cjs"),
      "./sources/node/http$": path.resolve(__dirname, "scripts/aurora-local-source.cjs"),
      "./sources/node/file$": path.resolve(__dirname, "scripts/aurora-local-source.cjs"),
      fs: false,
      crypto: false,
      "process/browser": require.resolve("process/browser.js"),
    },
  },
  module: {
    rules: [
      { test: /essentia-wasm\.web\.js$/, use: [path.resolve(__dirname, "scripts/essentia-worker-loader.cjs")] },
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
      {
        test: /\.wasm$/,
        oneOf: [
          {
            include: /node_modules[\\/]ebur128-wasm/,
            type: "webassembly/async",
          },
          {
            type: "asset/resource",
          },
        ],
      },
    ],
  },
  experiments: {
    asyncWebAssembly: true,
  },
  plugins: [
    // No caller enables speechQualityEnhancement. Keep standard Opus decoding
    // and exclude the optional 3.9 MiB LACE/NoLACE model chunk at build time.
    new webpack.IgnorePlugin({
      resourceRegExp: /^@wasm-audio-decoders\/opus-ml$/,
    }),
    new webpack.ProvidePlugin({
      process: "process/browser", // provide a shim for the global `process` variable
    }),
    new ExtractLoudnessWorkletPlugin(),
  ],
};

const webExtensionConfig = {
  mode: "none", // this leaves the source code as close as possible to the original (when packaging we set this to 'production')
  target: "webworker", // extensions run in a webworker context
  entry: {
    extension: "./src/extension.ts", // source of the web extension main file
  },
  output: {
    filename: "[name].js",
    path: path.join(__dirname, "./dist/web"),
    libraryTarget: "commonjs",
    devtoolModuleFilenameTemplate: "../../[resource-path]",
  },
  resolve: {
    mainFields: ["browser", "module", "main"], // look for `browser` entry point in imported node modules
    extensions: [".ts", ".js"], // support ts-files and js-files
    fallback: {
      // Webpack 5 no longer polyfills Node.js core modules automatically.
      // see https://webpack.js.org/configuration/resolve/#resolvefallback
      // for the list of Node.js core module polyfills.
      assert: require.resolve("assert"),
      path: require.resolve("path-browserify"),
      // autoEqHost prefers Node https but falls back to global fetch here.
      https: false,
    },
    alias: {
      ...essentiaAlias,
      fs: false,
      crypto: false,
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser", // provide a shim for the global `process` variable
    }),
  ],
  externals: {
    vscode: "commonjs vscode", // ignored because it doesn't exist
  },
  performance: {
    hints: false,
  },
  devtool: "nosources-source-map", // create a source map that points to the original source file
};

module.exports = [extensionConfig, webviewConfig, webExtensionConfig];
