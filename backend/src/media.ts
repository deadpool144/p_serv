import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { Readable, PassThrough } from 'stream';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import ffmpegPath from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { getAesKey, getCipherAtOffset } from './crypto.js';
import { ACCESS_KEY, THUMBNAIL_DIR } from './config.js';

if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath as any);
}
if (ffprobeStatic) {
    // Some versions of ffprobe-static export a string directly, others have a .path property
    const p = typeof ffprobeStatic === 'string' ? ffprobeStatic : (ffprobeStatic as any).path;
    if (p) ffmpeg.setFfprobePath(p);
}

const KEY_BUFFER = getAesKey(ACCESS_KEY);

export async function generateThumbnail(filePath: string | Readable, id: string, type: string) {
    const outPath = path.join(THUMBNAIL_DIR, id);
    await fs.ensureDir(THUMBNAIL_DIR);

    let thumbBuffer: Buffer;

    try {
        if (type.startsWith('image/')) {
            if (typeof filePath === 'string') {
                thumbBuffer = await sharp(filePath)
                    .resize(400, 400, { fit: 'cover', position: 'center' })
                    .jpeg({ quality: 80 })
                    .toBuffer();
            } else {
                const transformer = sharp()
                    .resize(400, 400, { fit: 'cover', position: 'center' })
                    .jpeg({ quality: 80 });
                filePath.pipe(transformer);
                thumbBuffer = await transformer.toBuffer();
            }
        } else if (type.startsWith('video/') || type.startsWith('audio/')) {
            const tmpFile = path.join(THUMBNAIL_DIR, `${id}_tmp.jpg`);
            const mediaTmp = path.join(THUMBNAIL_DIR, `${id}_m.tmp`);

            if (typeof filePath !== 'string') {
                const writeStream = fs.createWriteStream(mediaTmp);
                filePath.pipe(writeStream);
                await new Promise((resolve, reject) => {
                    writeStream.on('finish', resolve);
                    writeStream.on('error', reject);
                });
            }

            const ffmpegInput = typeof filePath === 'string' ? filePath : mediaTmp;

            // Extract cover art / screenshot
            await new Promise<void>((resolve, reject) => {
                const cmd = ffmpeg(ffmpegInput);
                
                if (type.startsWith('audio/')) {
                    // For audio, try to extract the embedded cover art (first video stream)
                    cmd.output(tmpFile)
                       .frames(1)
                       .on('end', () => resolve())
                       .on('error', (err) => {
                           console.warn(`[Media] Audio cover extraction failed for ${id}, might have no art: ${err.message}`);
                           resolve(); // Resolve anyway to avoid blocking
                       })
                       .run();
                } else {
                    // For video, use standard screenshot
                    cmd.on('error', (err) => reject(err))
                       .on('end', () => resolve())
                       .screenshots({
                           count: 1,
                           timestamps: ['1'],
                           filename: path.basename(tmpFile),
                           folder: path.dirname(tmpFile),
                           size: '400x?'
                       });
                }
            });

            if (await fs.pathExists(tmpFile)) {
                thumbBuffer = await fs.readFile(tmpFile);
                await fs.remove(tmpFile);
            } else {
                // If audio had no cover, we just exit quietly
                if (type.startsWith('audio/')) {
                    if (fs.existsSync(mediaTmp)) await fs.remove(mediaTmp);
                    return;
                }
                throw new Error("FFmpeg finished but no thumbnail file was created.");
            }

            if (fs.existsSync(mediaTmp)) await fs.remove(mediaTmp);
        } else {
            return;
        }

        const nonce = crypto.randomBytes(16);
        const cipher = getCipherAtOffset(KEY_BUFFER, nonce, 0);
        const encrypted = Buffer.concat([cipher.update(thumbBuffer), cipher.final()]);

        await fs.writeFile(outPath, Buffer.concat([nonce, encrypted]));
    } catch (err: any) {
        console.error(`[Media] Failed for ${id}:`, err?.message || err);
    }
}

/**
 * Normalizes video for smooth web playback:
 * - movflags faststart: moves index to the front
 * - fragmented output: perfect for MSE/Streaming
 */
/**
 * Normalizes video for smooth web playback:
 * - Pass 1: Try Intel QuickSync (iGPU) for high speed.
 * - Pass 2: Fallback to libx264 (CPU) if Pass 1 fails (drivers/device busy).
 */
export async function normalizeVideo(inputPath: string, outputPath: string, forceTranscode: boolean = false): Promise<void> {
    const { spawn } = await import('child_process');

    const runFFmpeg = (args: string[]) => new Promise<void>((resolve, reject) => {
        if (!ffmpegPath) return reject(new Error("FFmpeg path not found"));
        console.log(`[Media] Running transcode pass...`);

        const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });

        proc.on('error', (err) => {
            console.error(`[Media] Spawn Error: ${err.message}`);
            reject(err);
        });

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exited with code ${code}`));
        });
    });

    const tryQSV = () => runFFmpeg([
        '-init_hw_device', 'qsv=qsv:hw',
        '-filter_hw_device', 'qsv',
        '-hwaccel', 'qsv',
        '-hwaccel_output_format', 'qsv',
        '-i', inputPath,
        '-c:v', 'h264_qsv',
        '-preset', 'veryfast',
        '-global_quality', '20',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-sn',
        '-pix_fmt', 'yuv420p',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
        '-f', 'mp4',
        '-y',
        outputPath
    ]);

    const tryCPU = () => runFFmpeg([
        '-i', inputPath,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-sn',
        '-pix_fmt', 'yuv420p',
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
        '-f', 'mp4',
        '-y',
        outputPath
    ]);

    // Pass 1: QSV (Hardware Accelerated)
    if (forceTranscode) {
        try {
            console.log(`[Media] Attempting Pass 1: iGPU (QSV)...`);
            await tryQSV();
            const stats = await fs.stat(outputPath);
            if (stats.size > 1024 * 1024) {
                console.log(`[Media] QSV Success: ${Math.round(stats.size / 1024 / 1024)}MB`);
                return;
            }
            console.warn(`[Media] QSV output too small (${stats.size}b), trying fallback...`);
        } catch (qsvErr) {
            console.warn(`[Media] QSV Exception: ${qsvErr}`);
        }
    }

    // Pass 2: CPU (Software Fallback)
    if (forceTranscode) {
        try {
            console.log(`[Media] Attempting Pass 2: CPU (libx264)...`);
            if (await fs.pathExists(outputPath)) await fs.remove(outputPath);
            await tryCPU();
            const stats = await fs.stat(outputPath);
            if (stats.size > 1024 * 1024) return;
            throw new Error("Transcode failed: result too small.");
        } catch (cpuErr) {
            console.error(`[Media] CPU Fatal Error: ${cpuErr}`);
            throw cpuErr;
        }
    } else {
        // Fast Start only (no re-encode)
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                .outputOptions([
                    '-c', 'copy',
                    '-movflags', 'frag_keyframe+empty_moov+default_base_moof+faststart',
                    '-f', 'mp4'
                ])
                .on('error', reject)
                .on('end', () => resolve())
                .save(outputPath);
        });
    }
}

/**
 * Probes video duration using ffprobe.
 */
export async function getVideoDuration(inputPath: string): Promise<number> {
    const { spawnSync } = await import('child_process');
    const p = typeof ffprobeStatic === 'string' ? ffprobeStatic : (ffprobeStatic as any).path;
    if (!p) throw new Error("ffprobe path not found");

    const runProbe = (args: string[]) => {
        const result = spawnSync(p, args, { encoding: 'utf8' });
        if (result.status !== 0) return null;
        try {
            return JSON.parse(result.stdout);
        } catch {
            return null;
        }
    };

    // 1. Fast probe
    let data = runProbe(['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', inputPath]);

    // 2. Deep scan fallback
    if (!data || !(data.format?.duration || data.streams?.some((s: any) => s.duration))) {
        console.log(`[Media] Fast probe failed, starting deep scan for ${path.basename(inputPath)}...`);
        data = runProbe([
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_format',
            '-show_streams',
            '-probesize', '100M',
            '-analyze_duration', '100M',
            inputPath
        ]);
    }

    if (!data) return 0;

    const formatDur = parseFloat(data.format?.duration || '0');
    let maxStreamDur = 0;
    if (data.streams) {
        for (const s of data.streams) {
            if (s.duration) {
                const sd = parseFloat(s.duration);
                if (sd > maxStreamDur) maxStreamDur = sd;
            }
        }
    }

    const finalDur = Math.max(formatDur, maxStreamDur);
    console.log(`[Media] Final probed duration: ${finalDur.toFixed(2)}s`);
    return finalDur;
}

/**
 * Spawns a live FFmpeg process for on-the-fly hardware transcoding.
 * Returns a ChildProcess with stdin (source) and stdout (transcoded stream).
 * Explicitly handles request termination and bitrate control.
 */
export function spawnStreamProcessor(
    req: any,
    useQSV: boolean = true,
    inputOptions: string[] = []
): ChildProcessWithoutNullStreams {

    if (!ffmpegPath) throw new Error("FFmpeg not found");

    const inputArgs = [
        '-nostdin',                       // 🔥 Prevent blocking
        '-loglevel', 'error',             // 🔥 cleaner logs
        ...inputOptions,
        '-probesize', '1M',               // 🔥 Faster start
        '-analyzeduration', '1M',
        '-fflags', '+genpts',             // 🔥 stabilize timestamps
        '-i', 'pipe:0'
    ];

    const outputArgs = [
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov+separate_moof+omit_tfhd_offset', // 🔥 most stable fragments
        '-flush_packets', '1',
        'pipe:1'
    ];

    let ff: ChildProcessWithoutNullStreams;

    try {
        if (useQSV) {
            console.log("[Media] Spawning QSV Stream...");
            ff = spawn(ffmpegPath as string, [
                '-init_hw_device', 'qsv=qsv:hw',
                '-filter_hw_device', 'qsv',
                '-hwaccel', 'qsv',
                ...inputArgs,
                '-c:v', 'h264_qsv',
                '-preset', 'veryfast',
                '-global_quality', '25',
                '-g', '48',               // 🔥 Keyframes every 2s
                '-keyint_min', '48',
                '-sc_threshold', '0',
                '-maxrate', '2M',          // 🔥 bitrate control
                '-bufsize', '4M',
                ...outputArgs
            ]);
        } else {
            throw new Error("Skip QSV");
        }
    } catch {
        console.warn("[Media] Falling back to CPU...");
        ff = spawn(ffmpegPath as string, [
            ...inputArgs,
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '28',
            '-g', '48',                  // 🔥 Keyframes every 2s
            '-keyint_min', '48',
            '-sc_threshold', '0',
            '-maxrate', '2M',             // 🔥 bitrate control
            '-bufsize', '4M',
            ...outputArgs
        ]);
    }

    // =========================
    // 🔥 CRITICAL FIXES BELOW
    // =========================

    // ✅ Kill FFmpeg when client disconnects
    req.on('close', () => {
        console.log('[Stream] Client disconnected → killing FFmpeg');
        ff.kill('SIGKILL');
    });

    // ✅ Handle stdout pipe errors (Broken pipe)
    ff.stdout.on('error', (err: any) => {
        if (err.code === 'EPIPE') {
            console.log('[Stream] stdout broken pipe (expected on client exit)');
        } else {
            console.error('[Stream] stdout error:', err);
        }
        ff.kill('SIGKILL');
    });

    // ✅ Prevent crash on stdin issues
    ff.stdin.on('error', () => {});

    // ✅ Log stderr for debugging (optional but useful)
    ff.stderr.on('data', (data) => {
        const msg = data.toString();
        if (msg.includes('error') || msg.includes('Error')) {
            console.error('[FFmpeg-Live]', msg);
        }
    });

    // ✅ Handle process exit properly
    ff.on('close', (code) => {
        if (code === 0 || code === 255 || code === -40) {
            console.log('[Stream] FFmpeg closed normally:', code);
        } else {
            console.error('[Stream] FFmpeg exited with code:', code);
        }
    });

    return ff;
}
