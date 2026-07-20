import { encodeToWav } from "./encoder";

/**
 * Behavior anchors for the WAV encoder: RIFF/fmt header layout, 16-bit PCM
 * sample conversion (asymmetric ±1 scaling, clamping) and interleaving.
 */

function readAscii(bytes: Uint8Array, off: number, len: number): string {
  return String.fromCharCode(...bytes.subarray(off, off + len));
}

describe("encodeToWav", () => {
  test("writes a canonical 44-byte RIFF/WAVE header", () => {
    const wav = encodeToWav([new Float32Array([0, 0.5])], 48000, 1);
    const view = new DataView(wav.buffer);
    expect(readAscii(wav, 0, 4)).toBe("RIFF");
    expect(readAscii(wav, 8, 4)).toBe("WAVE");
    expect(readAscii(wav, 12, 4)).toBe("fmt ");
    expect(readAscii(wav, 36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(48000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(view.getUint32(40, true)).toBe(2 * 2); // data bytes
    expect(wav.length).toBe(44 + 4);
  });

  test("converts samples with asymmetric ±1 scaling and clamps overs", () => {
    const wav = encodeToWav(
      [new Float32Array([0, 1, -1, 0.5, -0.5, 2, -2])],
      44100,
      1,
    );
    const view = new DataView(wav.buffer);
    const s = (i: number) => view.getInt16(44 + i * 2, true);
    expect(s(0)).toBe(0);
    expect(s(1)).toBe(0x7fff); // +1 → 32767
    expect(s(2)).toBe(-0x8000); // −1 → −32768
    expect(s(3)).toBe(Math.trunc(0.5 * 0x7fff)); // 16383.5 truncated by int16 store
    expect(s(4)).toBe(-0x4000); // −0.5*32768
    expect(s(5)).toBe(0x7fff); // clamp over
    expect(s(6)).toBe(-0x8000); // clamp under
  });

  test("interleaves stereo channels L,R per frame", () => {
    const wav = encodeToWav(
      [new Float32Array([0.25, -0.25]), new Float32Array([-0.75, 0.75])],
      48000,
      2,
    );
    const view = new DataView(wav.buffer);
    const s = (i: number) => view.getInt16(44 + i * 2, true);
    expect(s(0)).toBe(Math.trunc(0.25 * 0x7fff)); // L0
    expect(s(1)).toBe(-0.75 * 0x8000); // R0
    expect(s(2)).toBe(-0.25 * 0x8000); // L1
    expect(s(3)).toBe(Math.trunc(0.75 * 0x7fff)); // R1
  });
});
