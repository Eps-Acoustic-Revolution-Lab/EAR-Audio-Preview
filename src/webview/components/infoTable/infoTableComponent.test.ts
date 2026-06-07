import InfoTableComponent from "./infoTableComponent";

function metaValue(name: string): string | undefined {
  return document
    .querySelector(`.js-audioMeta-${name} .audioMeta__value`)
    ?.textContent;
}

describe("infoTableComponent", () => {
  let infoTableComponent: InfoTableComponent;
  beforeAll(() => {
    document.body.innerHTML = '<div id="info-table"></div>';
    infoTableComponent = new InfoTableComponent("#info-table");
  });

  test("show encoding", () => {
    infoTableComponent.showInfo(2, 44100, 1, "s16", "pcm_s16le", 16);
    expect(metaValue("encoding")).toBe("pcm_s16le");
  });

  test("show format", () => {
    infoTableComponent.showInfo(2, 44100, 1, "s16", "pcm_s16le", 16);
    expect(metaValue("format")).toBe("s16");
  });

  test("show number of channel (mono)", () => {
    infoTableComponent.showInfo(1, 44100, 1, "s16", "pcm_s16le", 24);
    expect(metaValue("number_of_channel")).toBe("1 ch (mono)");
  });

  test("show number of channel (stereo)", () => {
    infoTableComponent.showInfo(2, 44100, 1, "s16", "pcm_s16le", 16);
    expect(metaValue("number_of_channel")).toBe("2 ch (stereo)");
  });

  test("show sample rate", () => {
    infoTableComponent.showInfo(2, 44100, 1, "s16", "pcm_s16le", 16);
    expect(metaValue("sample_rate")).toBe("44,100 Hz");
  });

  test("show bit depth when known", () => {
    infoTableComponent.showInfo(2, 44100, 1, "s16", "pcm_s16le", 24);
    expect(metaValue("bit_depth")).toBe("24 bit");
  });

  test("show bit depth placeholder when unknown", () => {
    infoTableComponent.showInfo(2, 44100, 1, "MP3", "PCM", null);
    expect(metaValue("bit_depth")).toBe("—");
  });

  test("show file size", () => {
    infoTableComponent.showInfo(2, 44100, 1, "s16", "pcm_s16le", 16);
    expect(metaValue("file_size")).toBe("1 bytes");
  });

  test("show duration", () => {
    infoTableComponent.showAdditionalInfo(12.34);
    expect(metaValue("duration")).toBe("12.3 s");
  });

  afterAll(() => {
    infoTableComponent.dispose();
  });
});
