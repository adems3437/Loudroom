import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Video tests need ffmpeg on this machine; without it they are skipped (and say so). */
export const hasFfmpeg = (() => {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    execFileSync('ffprobe', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * Generates a small test video with ffmpeg (no binary fixtures in the repo). It carries a
 * title and a GPS location that an upload must strip.
 */
export function makeVideo(
  options: { format?: 'mp4' | 'webm' | 'mkv'; seconds?: number; audio?: boolean } = {},
): Buffer {
  const format = options.format ?? 'mp4';
  const dir = mkdtempSync(join(tmpdir(), 'loudroom-test-video-'));
  const out = join(dir, `video.${format}`);
  const codecs =
    format === 'webm'
      ? ['-c:v', 'libvpx-vp9', '-b:v', '200k', '-c:a', 'libopus']
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  try {
    execFileSync(
      'ffmpeg',
      [
        ['-v', 'error', '-y'],
        ['-f', 'lavfi', '-i', `testsrc=size=160x120:rate=10:duration=${options.seconds ?? 2}`],
        options.audio === false
          ? []
          : ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${options.seconds ?? 2}`],
        codecs,
        ['-metadata', 'title=secret-title', '-metadata', 'location=+41.0082+028.9784/'],
        [out],
      ].flat(),
      { stdio: 'ignore' },
    );
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** ffprobe's view of a file: container tags and streams. */
export function probeBuffer(data: Buffer): {
  format: { format_name: string; duration?: string; tags?: Record<string, string> };
  streams: { codec_type: string; codec_name: string; tags?: Record<string, string> }[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'loudroom-test-probe-'));
  try {
    const file = join(dir, 'file');
    writeFileSync(file, data);
    const json = execFileSync('ffprobe', [
      ...['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    ]);
    return JSON.parse(json.toString('utf8')) as ReturnType<typeof probeBuffer>;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
