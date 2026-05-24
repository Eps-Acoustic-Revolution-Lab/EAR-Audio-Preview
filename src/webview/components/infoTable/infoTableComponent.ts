import "./infoTableComponent.css";
import Component from "../../component";

export default class InfoTableComponent extends Component {
  private _infoTable: HTMLTableElement;

  constructor(componentRootSelector: string) {
    super();
    const parent = document.querySelector(componentRootSelector);
    this._infoTable = document.createElement("table");
    this._infoTable.classList.add("infoTable");
    parent.appendChild(this._infoTable);
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
      { name: "encoding", value: `${encoding}` },
      { name: "format", value: `${format}` },
      { name: "number_of_channel", value: `${numChannels} ch (${channels})` },
      { name: "sample_rate", value: `${sampleRate.toLocaleString()} Hz` },
      { name: "bit_depth", value: bitDepthStr },
      { name: "file_size", value: `${fileSize.toLocaleString()} bytes` },
    ];

    const trList = this._infoTable.querySelectorAll("tr");
    trList.forEach((tr) => {
      this._infoTable.removeChild(tr);
    });
    for (const i of info) {
      this.insertTableData(i.name, i.value);
    }
  }

  public showAdditionalInfo(duration: number) {
    this.insertTableData(
      "duration",
      duration.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " s",
    );
  }

  /** Insert or update a row by field name (e.g. async loudness summary). */
  public setField(name: string, label: string, value: string) {
    const existing = this._infoTable.querySelector(
      `.js-infoTableData-${name}`,
    ) as HTMLTableCellElement | null;
    if (existing) {
      existing.textContent = value;
      const labelTd = existing.previousElementSibling as HTMLTableCellElement;
      if (labelTd) {
        labelTd.textContent = label;
      }
      return;
    }
    this.insertTableData(name, value, label);
  }

  private insertTableData(name: string, value: string, label?: string) {
    const tr = document.createElement("tr");
    tr.classList.add("infoTableRow");

    const nameTd = document.createElement("td");
    nameTd.classList.add("infoTableData");
    nameTd.textContent = label ?? name;
    tr.appendChild(nameTd);

    const valueTd = document.createElement("td");
    valueTd.textContent = value;
    valueTd.classList.add("infoTableData");
    valueTd.classList.add(`js-infoTableData-${name}`);

    tr.appendChild(valueTd);

    this._infoTable.appendChild(tr);
  }
}
