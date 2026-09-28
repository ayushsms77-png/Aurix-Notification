declare module 'jpeg-js' {
  export interface DecodedImage {
    data: Uint8Array;
    width: number;
    height: number;
  }
  export interface DecodeOpts {
    useTArray?: boolean;
    formatAsRGBA?: boolean;
    tolerantDecoding?: boolean;
    maxMemoryUsageInMB?: number;
  }
  export function decode(data: Uint8Array, opts?: DecodeOpts): DecodedImage;
}
