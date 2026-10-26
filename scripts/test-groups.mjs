/** Architecture groups for colocated Jest tests; npm test remains the full suite. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const groups = [
  {
    name: "sdk",
    description: "Standalone visualization SDK contracts and lifecycle",
    matches: /^src\/sdk\//,
  },
  {
    name: "host",
    description: "Extension host, file lifecycle and provider bridges",
    matches: /^(src\/audioPreviewEditor\.|src\/(comparison|extensionHost)\/)/,
  },
  {
    name: "shared",
    description: "Shared computation and data contracts",
    matches: /^src\/shared\//,
  },
  {
    name: "services",
    description: "Single-file playback, analysis, settings and export",
    matches: /^src\/webview\/services\//,
  },
  {
    name: "comparison",
    description: "Multi-file state, transport, workers and views",
    matches: /^src\/webview\/comparison\//,
  },
  {
    name: "ui",
    description: "Components, DOM interaction and spectrogram layout",
    matches:
      /^(src\/webview\/components\/|src\/webview\/spectrogramFrequencyLayout\.)/,
  },
  {
    name: "utils",
    description: "DSP kernels, geometry, plotting and runtime loaders",
    matches: /^src\/webview\/utils\//,
  },
  {
    name: "codecs",
    description: "Audio decoding and encoding",
    matches: /^(src\/webview\/decoders\/|src\/webview\/encoder\.)/,
  },
  {
    name: "contracts",
    description: "Message protocol and repository policy",
    matches:
      /^src\/(message\.contract|eslintPolicy)\.|^src\/webview\/service\./,
  },
  {
    name: "integration",
    description: "Explicit real-dependency integration tests",
    matches: /\.integration\.(test|spec)\.[jt]sx?$/,
  },
];

export function classifyTest(file) {
  const normalized = file.replaceAll("\\", "/");
  // Integration is a separate execution group even when owned by a source module.
  if (
    groups
      .find((group) => group.name === "integration")
      .matches.test(normalized)
  )
    return "integration";
  const matched = groups
    .filter((group) => group.name !== "integration")
    .filter((group) => group.matches.test(normalized));
  if (matched.length !== 1) {
    throw new Error(
      `Expected exactly one architecture group for ${file}; found ${matched.length}. Update scripts/test-groups.mjs.`,
    );
  }
  return matched[0].name;
}

export function discoverTests(root) {
  const files = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const relative = path
          .relative(root, absolute)
          .split(path.sep)
          .join("/");
        if (
          /\.[jt]sx?$/.test(relative) &&
          (relative.includes("/__tests__/") ||
            /\.(test|spec)\.[jt]sx?$/.test(relative))
        )
          files.push(relative);
      }
    }
  }
  walk(path.join(root, "src"));
  return files.sort();
}

export function inventory(files) {
  const result = Object.fromEntries(groups.map((group) => [group.name, []]));
  for (const file of files) result[classifyTest(file)].push(file);
  return result;
}

export function selectTests(catalog, names) {
  if (!names.length)
    throw new Error(
      "Choose a group, e.g. npm run test:group -- comparison services. Use --list to see all groups.",
    );
  for (const name of names) {
    if (!groups.some((group) => group.name === name))
      throw new Error(`Unknown test group: ${name}. Use --list.`);
    if (!catalog[name].length) throw new Error(`No tests in group: ${name}`);
  }
  return [...new Set(names.flatMap((name) => catalog[name]))];
}

function main(args) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = discoverTests(root);
  if (!files.length) throw new Error("No source tests discovered");
  const catalog = inventory(files);
  if (args.length === 1 && ["--list", "--check"].includes(args[0])) {
    for (const group of groups)
      console.log(
        `${group.name.padEnd(12)} ${String(catalog[group.name].length).padStart(2)}  ${group.description}`,
      );
    console.log(
      `${files.length} source test files; each belongs to exactly one group. Tooling tests run separately via npm run test:tooling.`,
    );
    return;
  }
  const separator = args.indexOf("--");
  const names = separator < 0 ? args : args.slice(0, separator);
  const forwarded = separator < 0 ? [] : args.slice(separator + 1);
  const selected = selectTests(catalog, names);
  const workerOptions = forwarded.some(
    (arg) => arg === "--runInBand" || arg === "-i",
  )
    ? []
    : ["--maxWorkers=2"];
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/jest/bin/jest.js"),
      ...workerOptions,
      "--workerIdleMemoryLimit=512MB",
      "--runTestsByPath",
      ...selected,
      ...forwarded,
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
