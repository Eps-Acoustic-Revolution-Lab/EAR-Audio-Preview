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
uniform int u_freqMode; // 0=linear, 1=log piecewise, 2=mel
uniform float u_logBounds[${MAX_LOG_BOUNDS}];
uniform int u_logBoundCount;
in vec2 v_uv;
out vec4 fragColor;

float log10f(float x) {
  return log(x) / 2.302585092994046;
}

vec3 spectrogramColor(float t) {
  t = clamp(t, 0.0, 1.0);
  float s = t * 6.0;
  int seg = int(s);
  float f = s - float(seg);
  if (seg == 0) return vec3(1.0, 1.0, (125.0 + f * 130.0) / 255.0);
  if (seg == 1) return vec3(1.0, (125.0 + f * 130.0) / 255.0, 125.0 / 255.0);
  if (seg == 2) return vec3(1.0, f * 125.0 / 255.0, 125.0 / 255.0);
  if (seg == 3) return vec3((125.0 + f * 130.0) / 255.0, 0.0, 125.0 / 255.0);
  if (seg == 4) return vec3(f * 125.0 / 255.0, 0.0, 125.0 / 255.0);
  return vec3(0.0, 0.0, f * 125.0 / 255.0);
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
    } else {
      hz = mix(u_freqMinHz, u_freqMaxHz, yNorm);
    }
    freqUV = (hz - u_freqMinHz) / spanHz;
  }
  freqUV = clamp(freqUV, 0.0, 1.0);
  float amp = texture(u_spectrogram, vec2(freqUV, v_uv.x)).r;
  float t = clamp((amp - u_low) / (u_high - u_low), 0.0, 1.0);
  fragColor = vec4(spectrogramColor(1.0 - t), 1.0);
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
    this._programInfo = twgl.createProgramInfo(gl, [vertexShader, fragmentShader]);
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
