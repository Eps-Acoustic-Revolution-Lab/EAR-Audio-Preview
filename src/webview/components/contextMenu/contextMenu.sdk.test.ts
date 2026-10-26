import { ContextMenu } from "./contextMenu";

describe("SDK context menu scope", () => {
  it("keeps SDK menus inside their theme root and cleans up", () => {
    const root = document.createElement("div");
    root.className = "ear-sdk";
    const target = document.createElement("button");
    root.append(target);
    document.body.append(root);
    const menu = new ContextMenu();
    target.addEventListener("contextmenu", (event) => {
      menu.open(event as MouseEvent, [{ label: "FFT", action: () => {} }]);
    });
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(root.querySelector('[role="menu"]')).not.toBeNull();
    menu.dispose();
    expect(root.querySelector('[role="menu"]')).toBeNull();
    root.remove();
  });
});
