"use strict";
const fs = require("fs");
const path = require("path");
const webpack = require("webpack");

/** Extract loudness-worklet processor source to dist/loudness.worklet.js (CSP-safe). */
class ExtractLoudnessWorkletPlugin {
  apply(compiler) {
    compiler.hooks.beforeRun.tap("ExtractLoudnessWorkletPlugin", () => {
      const srcPath = path.join(
        __dirname,
        "node_modules/loudness-worklet/packages/lib/dist/index.js",
      );
      if (!fs.existsSync(srcPath)) {
        return;
      }
      const src = fs.readFileSync(srcPath, "utf8");
      const startMarker = "const i = `";
      const endMarker = '`, t = "loudness-processor"';
      const start = src.indexOf(startMarker);
      const end = src.indexOf(endMarker, start);
      if (start < 0 || end < 0) {
        console.warn(
          "[ExtractLoudnessWorkletPlugin] Could not parse loudness-worklet bundle",
        );
        return;
      }
      const body = src.slice(start + startMarker.length, end);
      const outPath = path.join(__dirname, "dist/loudness.worklet.js");
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, body, "utf8");

      const essentiaWasmSrc = path.join(
        __dirname,
        "node_modules/essentia.js/dist/essentia-wasm.web.wasm",
      );
      const essentiaWasmOut = path.join(__dirname, "dist/essentia-wasm.web.wasm");
      if (fs.existsSync(essentiaWasmSrc)) {
        fs.copyFileSync(essentiaWasmSrc, essentiaWasmOut);
      }
    });
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

  entry: "./src/webview/index.ts",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "audioPreview.js",
  },
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".js"],
    fallback: {
      assert: require.resolve("assert"), // Ooura(fft lib) contains assert
      path: require.resolve("path-browserify"),
    },
    alias: {
      fs: false,
      crypto: false,
      "process/browser": require.resolve("process/browser.js"),
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
    },
    alias: {
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
