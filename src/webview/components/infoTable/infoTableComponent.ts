import "./infoTableComponent.css";
import Component from "../../component";

export default class InfoTableComponent extends Component {
  private _root: HTMLElement;
  private _list: HTMLElement;

  constructor(componentRootSelector: string) {
    super();
    const parent = document.querySelector(componentRootSelector);
    if (!parent) {
      throw new Error(`Element not found: ${componentRootSelector}`);
    }

    this._root = document.createElement("div");
    this._root.classList.add("audioMeta");

    this._list = document.createElement("dl");
    this._list.classList.add("audioMeta__list", "panelGroup__items");

    this._root.appendChild(this._list);
    parent.appendChild(this._root);
  }

  public showInfo(
    numChannels: number,
    sampleRate: number,
    fileSize: number,
    format: string,
    encoding: string,
    bitDepth: number | null,
  ) {
    const channels =
      numChannels === 1 ? "mono" : numChannels === 2 ? "stereo" : "unsupported";

    const bitDepthStr =
      bitDepth !== null && bitDepth !== undefined && Number.isFinite(bitDepth)
        ? `${bitDepth} bit`
        : "—";

    const info = [
      { name: "encoding", label: "Encoding", value: `${encoding}` },
      { name: "format", label: "Format", value: `${format}` },
      {
        name: "number_of_channel",
        label: "Channels",
        value: `${numChannels} ch (${channels})`,
      },
      {
        name: "sample_rate",
        label: "Sample rate",
        value: `${sampleRate.toLocaleString()} Hz`,
      },
      { name: "bit_depth", label: "Bit depth", value: bitDepthStr },
      {
        name: "file_size",
        label: "File size",
        value: `${fileSize.toLocaleString()} bytes`,
      },
    ];

    this._list.replaceChildren();
    for (const i of info) {
      this.insertField(i.name, i.value, i.label);
    }
  }

  public showAdditionalInfo(duration: number) {
    this.insertField(
      "duration",
      duration.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " s",
      "Duration",
    );
  }

  /** Insert or update a row by field name (e.g. async loudness summary). */
  public setField(name: string, label: string, value: string) {
    const existing = this._list.querySelector(
      `.js-audioMeta-${name}`,
    ) as HTMLElement | null;
    if (existing) {
      const valueEl = existing.querySelector(".audioMeta__value");
      if (valueEl) {
        valueEl.textContent = value;
      }
      const labelEl = existing.querySelector(".audioMeta__label");
      if (labelEl) {
        labelEl.textContent = label;
      }
      return;
    }
    this.insertField(name, value, label);
  }

  private insertField(name: string, value: string, label?: string) {
    const row = document.createElement("div");
    row.classList.add("panelRow", "audioMeta__row", `js-audioMeta-${name}`);

    const labelEl = document.createElement("dt");
    labelEl.classList.add("panelRow__label", "audioMeta__label");
    labelEl.textContent = label ?? name;

    const valueEl = document.createElement("dd");
    valueEl.classList.add("panelRow__field", "audioMeta__value");
    valueEl.textContent = value;

    row.appendChild(labelEl);
    row.appendChild(valueEl);
    this._list.appendChild(row);
  }
}
