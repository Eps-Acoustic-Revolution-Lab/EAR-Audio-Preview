import EarEqSegmentedControl from "./earEqSegmentedControl";

describe("earEqSegmentedControl", () => {
  test("renders options and tracks active value", () => {
    document.body.innerHTML = '<div id="host"></div>';
    const host = document.getElementById("host") as HTMLElement;
    const changes: string[] = [];
    const seg = new EarEqSegmentedControl(
      [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
      "a",
      {
        onChange: (v) => changes.push(v),
      },
    );
    host.appendChild(seg.root);

    expect(seg.value).toBe("a");
    expect(
      seg.root.querySelector(".earEqSegment__option--active")?.textContent,
    ).toBe("A");

    seg.setValue("b");
    expect(seg.value).toBe("b");
    expect(changes).toEqual(["b"]);

    seg.setValue("b", true);
    expect(changes).toEqual(["b"]);

    seg.dispose();
  });
});
