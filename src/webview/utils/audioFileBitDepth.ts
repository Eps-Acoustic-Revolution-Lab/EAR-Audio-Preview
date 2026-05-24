/**
 * Read stored PCM bit depth from common container headers (no full decode).
 * Returns null when unknown (e.g. MP3, opaque Web Audio decode).
 */

function fourccLE(dv: DataView, offset: number): number {
  return dv.getUint32(offset, true);
}

/** Standard WAVE / RIFF: walk chunks for `fmt `, read wBitsPerSample (PCM / float). */
export function parseWavBitsPerSample(data: Uint8Array): number | null {
  if (data.byteLength < 12) {
    return null;
  }
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (fourccLE(dv, 0) !== 0x46464952 /* RIFF */) {
    return null;
  }
  if (fourccLE(dv, 8) !== 0x57415645 /* WAVE */) {
    return null;
  }
  let off = 12;
  while (off + 8 <= data.byteLength) {
    const id = fourccLE(dv, off);
    const size = dv.getUint32(off + 4, true);
    off += 8;
    if (off + size > data.byteLength) {
      return null;
    }
    if (id === 0x20746d66 /* 'fmt ' */ && size >= 16) {
      const audioFormat = dv.getUint16(off, true);
      const bits = dv.getUint16(off + 14, true);
      if (bits < 1 || bits > 64) {
        return null;
      }
      if (audioFormat === 1 || audioFormat === 0xfffe) {
        return bits;
      }
      if (audioFormat === 3) {
        return bits;
      }
      return null;
    }
    off += size + (size & 1);
  }
  return null;
}

/** FLAC native: first metadata block must be STREAMINFO; bits-per-sample in packed bitfield. */
export function parseFlacBitsPerSample(data: Uint8Array): number | null {
  if (data.byteLength < 8 + 34) {
    return null;
  }
  if (
    data[0] !== 0x66 ||
    data[1] !== 0x4c ||
    data[2] !== 0x61 ||
    data[3] !== 0x43
  ) {
    return null;
  }
  const h0 = data[4];
  const type = h0 & 0x7f;
  const len = (data[5] << 16) | (data[6] << 8) | data[7];
  if (type !== 0 || len !== 34 || data.byteLength < 8 + 34) {
    return null;
  }
  const si = data.subarray(8, 8 + 34);
  let bitPos = 0;
  const readBits = (n: number): number => {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const b = (bitPos / 8) | 0;
      const rem = 7 - (bitPos % 8);
      val = (val << 1) | ((si[b] >> rem) & 1);
      bitPos++;
    }
    return val;
  };
  readBits(16);
  readBits(16);
  readBits(24);
  readBits(24);
  readBits(20);
  readBits(3);
  const bpsMinus1 = readBits(5);
  const bps = bpsMinus1 + 1;
  return bps >= 4 && bps <= 32 ? bps : null;
}
