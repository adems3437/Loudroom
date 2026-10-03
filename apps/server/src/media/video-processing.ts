import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);

export interface VideoTools {
  ffmpeg: string;
  ffprobe: string;
}

export interface VideoLimits {
  maxDurationMs: number;
}

export type VideoFormat = 'mp4' | 'webm';

export interface ProbedVideo {
  format: VideoFormat;
  width: number;
  height: number;
  durationMs: number;
}

export interface ProcessedVideo extends ProbedVideo {
  data: Buffer;
}

/** The file is not a video we accept (format, codecs, length). */
export class UnsupportedVideoError extends Error {}

/** ffmpeg/ffprobe cannot be run on this machine. */
export class VideoToolsMissingError extends Error {}

/** Containers rounding the last frame may report a few ms more than the real length. */
const DURATION_TOLERANCE_MS = 250;

/** How long one ffprobe/ffmpeg run may take; remuxing 50 MB without re-encoding is quick. */
const TOOL_TIMEOUT_MS = 60_000;

/**
 * What browsers play everywhere without transcoding: MP4 with H.264 (+ AAC), or WebM with
 * VP8/VP9/AV1 (+ Opus/Vorbis). The same Matroska container with other codecs (.mkv) is refused.
 */
const CODECS: Record<VideoFormat, { video: Set<string>; audio: Set<string> }> = {
  mp4: { video: new Set(['h264']), audio: new Set(['aac']) },
  webm: { video: new Set(['vp8', 'vp9', 'av1']), audio: new Set(['opus', 'vorbis']) },
};

const probeSchema = z.object({
  format: z.object({ format_name: z.string(), duration: z.string().optional() }),
  streams: z.array(
    z.object({
      codec_type: z.string().optional(),
      codec_name: z.string().optional(),
      width: z.number().int().optional(),
      height: z.number().int().optional(),
    }),
  ),
});

/**
 * Decides from ffprobe's JSON whether a file is an accepted video (pure; the upload rules of
 * SPEC §9 / Phase 9 F7). Throws UnsupportedVideoError with the reason otherwise.
 */
export function evaluateProbe(json: unknown, limits: VideoLimits): ProbedVideo {
  const parsed = probeSchema.safeParse(json);
  if (!parsed.success) throw new UnsupportedVideoError('Not a readable video');
  const { format, streams } = parsed.data;
  const names = format.format_name.split(',');
  const container: VideoFormat | null = names.includes('mp4')
    ? 'mp4'
    : names.includes('webm')
      ? 'webm'
      : null;
  if (!container) throw new UnsupportedVideoError(`Unsupported container: ${format.format_name}`);

  const video = streams.find((stream) => stream.codec_type === 'video');
  const audio = streams.find((stream) => stream.codec_type === 'audio');
  const codecs = CODECS[container];
  if (!video?.codec_name || !codecs.video.has(video.codec_name)) {
    throw new UnsupportedVideoError(`Unsupported video codec: ${video?.codec_name ?? 'none'}`);
  }
  if (audio && (!audio.codec_name || !codecs.audio.has(audio.codec_name))) {
    throw new UnsupportedVideoError(`Unsupported audio codec: ${audio.codec_name ?? 'unknown'}`);
  }
  if (!video.width || !video.height) throw new UnsupportedVideoError('Unknown video size');

  const durationMs = Math.round(Number(format.duration) * 1000);
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new UnsupportedVideoError('Unknown video length');
  }
  if (durationMs > limits.maxDurationMs + DURATION_TOLERANCE_MS) {
    throw new UnsupportedVideoError(`The video is longer than ${limits.maxDurationMs / 1000} s`);
  }
  return {
    format: container,
    width: video.width,
    height: video.height,
    durationMs: Math.min(durationMs, limits.maxDurationMs),
  };
}

/** MP4 (`ftyp` box) or Matroska/WebM (EBML header): worth handing to ffprobe. */
export function looksLikeVideo(data: Buffer): boolean {
  const ftyp = data.length >= 12 && data.toString('latin1', 4, 8) === 'ftyp';
  const ebml = data.length >= 4 && data.readUInt32BE(0) === 0x1a45dfa3;
  return ftyp || ebml;
}

/** True when both tools start; checked once at startup. */
export async function videoToolsAvailable(tools: VideoTools): Promise<boolean> {
  try {
    await Promise.all([
      run(tools.ffprobe, ['-version'], { timeout: 5_000 }),
      run(tools.ffmpeg, ['-version'], { timeout: 5_000 }),
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks an upload with ffprobe, then remuxes it with ffmpeg (`-c copy`, no re-encoding) into a
 * clean file: every piece of metadata (location, device, title), chapters, data and subtitle
 * streams are dropped (SPEC §9), and MP4 gets its index up front so playback starts at once.
 * Tools run without a shell, on files in a private temporary directory removed afterwards.
 */
export async function processVideo(
  input: Buffer,
  tools: VideoTools,
  limits: VideoLimits,
): Promise<ProcessedVideo> {
  const dir = await mkdtemp(join(tmpdir(), 'loudroom-video-'));
  try {
    const source = join(dir, 'source');
    await writeFile(source, input);

    let probe: unknown;
    try {
      const { stdout } = await run(
        tools.ffprobe,
        ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', source],
        { timeout: TOOL_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
      probe = JSON.parse(stdout);
    } catch (error) {
      if (isMissingTool(error)) throw new VideoToolsMissingError('ffprobe is not available');
      throw new UnsupportedVideoError('Not a readable video');
    }
    const video = evaluateProbe(probe, limits);

    const target = join(dir, `clean.${video.format}`);
    try {
      await run(
        tools.ffmpeg,
        [
          ['-v', 'error', '-i', source],
          ['-map', '0:v:0', '-map', '0:a:0?'],
          ['-c', 'copy', '-map_metadata', '-1', '-map_chapters', '-1', '-dn', '-sn'],
          video.format === 'mp4' ? ['-movflags', '+faststart'] : [],
          ['-f', video.format, target],
        ].flat(),
        { timeout: TOOL_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (error) {
      if (isMissingTool(error)) throw new VideoToolsMissingError('ffmpeg is not available');
      throw new UnsupportedVideoError('The video could not be processed');
    }
    return { ...video, data: await readFile(target) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function isMissingTool(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
