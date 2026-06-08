import { readFileSync } from "fs";
import { join } from "path";

type NamingRule = {
  selector?: string | string[];
  modifiers?: string[];
  format?: string[] | null;
};

function loadNamingRules(): NamingRule[] {
  const configPath = join(__dirname, "..", ".eslintrc.json");
  const raw = readFileSync(configPath, "utf8").replace(/\/\/.*$/gm, "");
  const config = JSON.parse(raw) as {
    rules: Record<string, unknown>;
  };
  return config.rules["@typescript-eslint/naming-convention"] as NamingRule[];
}

describe("eslint naming policy", () => {
  const rules = loadNamingRules();

  it("allows UPPER_CASE for const variables (module constants)", () => {
    const constRule = rules.find(
      (rule) =>
        rule.selector === "variable" && rule.modifiers?.includes("const"),
    );
    expect(constRule?.format).toEqual(
      expect.arrayContaining(["camelCase", "UPPER_CASE"]),
    );
  });

  it("allows PascalCase on object literal methods (external API mocks)", () => {
    const methodRule = rules.find(
      (rule) => rule.selector === "objectLiteralMethod",
    );
    expect(methodRule?.format).toEqual(
      expect.arrayContaining(["camelCase", "PascalCase"]),
    );
  });
});
