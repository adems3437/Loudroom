import { describe, expect, it } from 'vitest';
import { evaluateProbe, looksLikeVideo, UnsupportedVideoError } from './video-processing.js';

const limits = { maxDurationMs: 60_000 };

function probe(
  formatName: string,
  duration: string | undefined,
  streams: { codec_type: string; codec_name: string; width?: number; height?: number }[],
) {
  return { format: { format_name: formatName, ...(duration ? { duration } : {}) }, streams };
}

const h264 = { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 };
const aac = { codec_type: 'audio', codec_name: 'aac' };

describe('video upload rules', () => {
  it('accepts MP4 with H.264 (+ AAC) and WebM with VP8/VP9/AV1 (+ Opus/Vorbis)', () => {
    expect(evaluateProbe(probe('mov,mp4,m4a,3gp,3g2,mj2', '12.48', [h264, aac]), limits)).toEqual({
      format: 'mp4',
      width: 1280,
      height: 720,
      durationMs: 12_480,
    });
    // Sound is optional.
    expect(evaluateProbe(probe('mov,mp4,m4a,3gp,3g2,mj2', '3', [h264]), limits).format).toBe('mp4');
    for (const codec of ['vp8', 'vp9', 'av1']) {
      const video = { codec_type: 'video', codec_name: codec, width: 640, height: 360 };
      const opus = { codec_type: 'audio', codec_name: 'opus' };
      expect(evaluateProbe(probe('matroska,webm', '5', [video, opus]), limits).format).toBe('webm');
    }
  });

  it('refuses other containers, codecs that browsers cannot play everywhere, and no video', () => {
    const cases = [
      probe('mp3', '5', [{ codec_type: 'audio', codec_name: 'mp3' }]),
      probe('avi', '5', [h264]),
      // A Matroska file with H.264 is .mkv, not WebM.
      probe('matroska,webm', '5', [h264]),
      probe('mov,mp4,m4a,3gp,3g2,mj2', '5', [{ ...h264, codec_name: 'hevc' }]),
      probe('mov,mp4,m4a,3gp,3g2,mj2', '5', [h264, { codec_type: 'audio', codec_name: 'mp3' }]),
      probe('mov,mp4,m4a,3gp,3g2,mj2', '5', [aac]),
      probe('png_pipe', '0.04', [{ codec_type: 'video', codec_name: 'png' }]),
      { not: 'a probe' },
    ];
    for (const json of cases) {
      expect(() => evaluateProbe(json, limits)).toThrow(UnsupportedVideoError);
    }
  });

  it('limits the length to 60 s, with a little room for container rounding', () => {
    const mp4 = (duration: string) => probe('mov,mp4,m4a,3gp,3g2,mj2', duration, [h264]);
    expect(evaluateProbe(mp4('60.2'), limits).durationMs).toBe(60_000);
    expect(() => evaluateProbe(mp4('61'), limits)).toThrow(/longer than 60 s/);
    expect(() => evaluateProbe(mp4('0'), limits)).toThrow(/length/);
    expect(() =>
      evaluateProbe(probe('mov,mp4,m4a,3gp,3g2,mj2', undefined, [h264]), limits),
    ).toThrow(/length/);
  });

  it('recognises MP4 and Matroska headers before running any tool', () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom0000', 'latin1')]);
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
    expect(looksLikeVideo(mp4)).toBe(true);
    expect(looksLikeVideo(webm)).toBe(true);
    expect(looksLikeVideo(Buffer.from('\x89PNG\r\n\x1a\n0000', 'latin1'))).toBe(false);
    expect(looksLikeVideo(Buffer.alloc(2))).toBe(false);
  });
});
