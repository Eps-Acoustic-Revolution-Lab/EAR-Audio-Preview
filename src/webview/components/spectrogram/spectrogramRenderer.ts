import * as twgl from "twgl.js";

/* eslint-disable @typescript-eslint/naming-convention */
const vertexShader = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const MAX_LOG_BOUNDS = 24;

const fragmentShader = `#version 300 es
precision highp float;
uniform sampler2D u_spectrogram;
uniform float u_low;
uniform float u_high;
uniform float u_freqMinHz;
uniform float u_freqMaxHz;
uniform float u_logMin;
uniform float u_logMax;
uniform float u_melMin;
uniform float u_melMax;
uniform int u_freqMode; // 0=linear, 1=log piecewise, 2=mel, 3=hybrid (linear↔log blend)
uniform float u_hybridRatio; // mode 3: 0=linear … 1=continuous log
uniform vec2 u_texelCount; // (numBins, numFrames) of u_spectrogram
uniform float u_logBounds[${MAX_LOG_BOUNDS}];
uniform int u_logBoundCount;
in vec2 v_uv;
out vec4 fragColor;

float log10f(float x) {
  return log(x) / 2.302585092994046;
}

vec3 dataColor(float t) {
  /* Magma-like perceptual ramp (from design-demo/gallery.html): uniform
     luminance growth so quiet detail stays visible and hot ridges pop —
     readable harmonic columns, no rainbow banding. Data encoding:
     identical in all themes. */
  t = clamp(t, 0.0, 1.0);
  const vec3 c0 = vec3(4.0, 3.0, 12.0) / 255.0;
  const vec3 c1 = vec3(59.0, 15.0, 79.0) / 255.0;
  const vec3 c2 = vec3(131.0, 38.0, 129.0) / 255.0;
  const vec3 c3 = vec3(209.0, 78.0, 114.0) / 255.0;
  const vec3 c4 = vec3(249.0, 142.0, 9.0) / 255.0;
  const vec3 c5 = vec3(252.0, 255.0, 164.0) / 255.0;
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.7) return mix(c2, c3, (t - 0.5) / 0.2);
  if (t < 0.88) return mix(c3, c4, (t - 0.7) / 0.18);
  return mix(c4, c5, clamp((t - 0.88) / 0.12, 0.0, 1.0));
}

float hzFromLogPiecewise(float yNorm) {
  int n = u_logBoundCount;
  if (n < 2) {
    return pow(10.0, mix(u_logMin, u_logMax, yNorm));
  }
  float span = float(n - 1);
  float pos = clamp(yNorm * span, 0.0, span - 1e-5);
  int si = int(floor(pos));
  if (si >= n - 1) {
    si = n - 2;
  }
  float frac = pos - float(si);
  float b0 = u_logBounds[si];
  float b1 = u_logBounds[si + 1];
  float l0 = log10f(max(b0, 1e-6));
  float l1 = log10f(max(b1, 1e-6));
  float lh = mix(l0, l1, frac);
  return pow(10.0, lh);
}

void main() {
  float yNorm = v_uv.y;
  float spanHz = max(u_freqMaxHz - u_freqMinHz, 1e-6);
  float freqUV;
  if (u_freqMode == 2) {
    float mel = mix(u_melMin, u_melMax, yNorm);
    freqUV = (mel - u_melMin) / max(u_melMax - u_melMin, 1e-6);
  } else {
    float hz;
    if (u_freqMode == 1) {
      hz = hzFromLogPiecewise(yNorm);
    } else if (u_freqMode == 3) {
      /* Hybrid: mirror of hybridHzFromNorm() in spectrogramFrequencyLayout.ts. */
      float hzLinear = mix(u_freqMinHz, u_freqMaxHz, yNorm);
      float hzLog = pow(10.0, mix(u_logMin, u_logMax, yNorm));
      hz = mix(hzLinear, hzLog, clamp(u_hybridRatio, 0.0, 1.0));
    } else {
      hz = mix(u_freqMinHz, u_freqMaxHz, yNorm);
    }
    freqUV = (hz - u_freqMinHz) / spanHz;
  }
  freqUV = clamp(freqUV, 0.0, 1.0);
  /* Anisotropic sampling for readability (iZotope RX / Audition style):
     NEAREST along time — transient/onset edges stay crisp, no horizontal
     smear; LINEAR along frequency — adjacent bins connect into continuous
     harmonic ridges instead of blocks. Spectrograms are anisotropic data:
     harmonics are smooth along frequency, percussive events sharp along
     time, so each axis gets the filtering that suits it. */
  int frame = clamp(int(v_uv.x * u_texelCount.y), 0, int(u_texelCount.y) - 1);
  float binF = freqUV * max(u_texelCount.x - 1.0, 1.0);
  int b0 = int(binF);
  int b1 = min(b0 + 1, int(u_texelCount.x) - 1);
  float a0 = texelFetch(u_spectrogram, ivec2(b0, frame), 0).r;
  float a1 = texelFetch(u_spectrogram, ivec2(b1, frame), 0).r;
  float amp = mix(a0, a1, binF - float(b0));
  float t = clamp((amp - u_low) / (u_high - u_low), 0.0, 1.0);
  fragColor = vec4(dataColor(t), 1.0);
}
`;
/* eslint-enable @typescript-eslint/naming-convention */

const quadAttributes = {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  a_position: {
    numComponents: 2,
    data: [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1],
  },
};

export class SpectrogramRenderer {
  private _gl: WebGL2RenderingContext;
  private _programInfo: twgl.ProgramInfo;
  private _bufferInfo: twgl.BufferInfo;
  private _texture: WebGLTexture | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL2 not supported");
    }
    this._gl = gl;
    this._programInfo = twgl.createProgramInfo(gl, [
      vertexShader,
      fragmentShader,
    ]);
    this._bufferInfo = twgl.createBufferInfoFromArrays(gl, quadAttributes);
  }

  public render(
    spectrogram: number[][],
    low: number,
    high: number,
    freqMode: number,
    freqMinHz: number,
    freqMaxHz: number,
    logMin: number,
    logMax: number,
    melMin: number,
    melMax: number,
    hybridRatio: number,
    logBoundCount: number,
    logBoundsPadded: Float32Array,
  ): void {
    const gl = this._gl;
    const numFrames = spectrogram.length;
    if (!numFrames) {
      return;
    }
    const numBins = spectrogram[0].length;
    if (!numBins) {
      return;
    }

    const pixels = new Float32Array(numFrames * numBins);
    for (let i = 0; i < numFrames; i++) {
      for (let j = 0; j < numBins; j++) {
        pixels[i * numBins + j] = spectrogram[i][j];
      }
    }

    if (this._texture) {
      gl.deleteTexture(this._texture);
    }
    this._texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.R32F,
      numBins,
      numFrames,
      0,
      gl.RED,
      gl.FLOAT,
      pixels,
    );
    /* Filtering is done manually in the shader (texelFetch: crisp in time,
       interpolated in frequency), so the sampler filter is irrelevant. */
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.useProgram(this._programInfo.program);
    twgl.setBuffersAndAttributes(gl, this._programInfo, this._bufferInfo);
    /* eslint-disable @typescript-eslint/naming-convention */
    twgl.setUniformsAndBindTextures(this._programInfo, {
      u_spectrogram: this._texture,
      u_low: low,
      u_high: high,
      u_freqMode: freqMode,
      u_freqMinHz: freqMinHz,
      u_freqMaxHz: freqMaxHz,
      u_logMin: logMin,
      u_logMax: logMax,
      u_melMin: melMin,
      u_melMax: melMax,
      u_hybridRatio: hybridRatio,
      u_texelCount: [numBins, numFrames],
      u_logBounds: logBoundsPadded,
      u_logBoundCount: logBoundCount,
    });
    /* eslint-enable @typescript-eslint/naming-convention */
    twgl.drawBufferInfo(gl, this._bufferInfo);
  }

  public dispose(): void {
    const gl = this._gl;
    if (this._texture) {
      gl.deleteTexture(this._texture);
    }
    this._texture = null;
  }
}

export const spectrogramLogBoundsMax = MAX_LOG_BOUNDS;

export function padLogBounds(bounds: number[]): {
  count: number;
  padded: Float32Array;
} {
  const count = Math.min(bounds.length, MAX_LOG_BOUNDS);
  const padded = new Float32Array(MAX_LOG_BOUNDS);
  for (let i = 0; i < count; i++) {
    padded[i] = bounds[i];
  }
  return { count, padded };
}

export function isWebGL2Supported(canvas: HTMLCanvasElement): boolean {
  return !!canvas.getContext("webgl2");
}
