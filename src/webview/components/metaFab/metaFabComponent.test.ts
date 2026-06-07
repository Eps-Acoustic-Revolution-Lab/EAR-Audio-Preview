import MetaFabComponent from "./metaFabComponent";

describe("metaFabComponent", () => {
  let metaFab: MetaFabComponent;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="settingsDock">
        <div id="metaPopoverMount"></div>
        <button type="button" id="settingsFab" disabled aria-busy="true">FAB</button>
      </div>
    `;
    metaFab = new MetaFabComponent("#metaPopoverMount", "#settingsFab");
  });

  afterEach(() => {
    metaFab.dispose();
  });

  test("creates popover shell with audio meta mount", () => {
    expect(document.getElementById("metaPopover")).not.toBeNull();
    expect(document.getElementById("audioMeta")).not.toBeNull();
  });

  test("does not open popover while loading", () => {
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    fab.disabled = false;
    metaFab.setLoading(true);
    fab.click();
    expect(document.getElementById("metaPopover")?.hidden).not.toBe(false);
    expect(fab.getAttribute("aria-expanded")).toBe("false");
  });

  test("toggles popover when loaded and enabled", () => {
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    fab.disabled = false;
    metaFab.setLoading(false);

    fab.click();
    expect(document.getElementById("metaPopover")?.hidden).toBe(false);
    expect(fab.getAttribute("aria-expanded")).toBe("true");

    fab.click();
    expect(fab.getAttribute("aria-expanded")).toBe("false");
  });

  test("closes popover on Escape", () => {
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    fab.disabled = false;
    metaFab.setLoading(false);
    fab.click();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(fab.getAttribute("aria-expanded")).toBe("false");
  });

  test("closes popover when backdrop is clicked", () => {
    const fab = document.getElementById("settingsFab") as HTMLButtonElement;
    fab.disabled = false;
    metaFab.setLoading(false);
    fab.click();

    const backdrop = document.querySelector(
      ".js-metaPopoverBackdrop",
    ) as HTMLElement;
    backdrop.click();
    expect(fab.getAttribute("aria-expanded")).toBe("false");
  });
});
