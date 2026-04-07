import { normalizeVideo, getVideoDuration } from './media.js';
import { getMeta, saveMeta, indexMoofOffsets, vaultDataPath } from './storage.js';
import { KEY_BUFFER } from './config.js';
import path from 'path';
import fs from 'fs-extra';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { getCipherAtOffset, getDecipherAtOffset } from './crypto.js'; // 🔥 FIX

export interface RepairTask {
    id: string;
    folder: string;
    originalName: string;
    encryptionKey?: string;
}

class BackgroundQueue {
    private queue: RepairTask[] = [];
    private processing = false;

    async add(task: RepairTask) {
        console.log(`[Queue] Adding: ${task.originalName}`);
        this.queue.push(task);
        if (!this.processing) {
            await this.processNext(); // 🔥 FIX (await)
        }
    }

    async requeuePendingTasks() {
        console.log("[Queue] Scanning interrupted tasks...");
        const { getDetailedListing } = await import('./storage.js');
        const { VAULT_DIR } = await import('./config.js');

        const items = await getDetailedListing("all");

        for (const item of items) {
            if (item.status === "processing") {
                const subPath =
                    item.type.startsWith("video/") ? "videos" :
                    item.type.startsWith("image/") ? "images" : "files";

                this.add({
                    id: item.id,
                    folder: path.join(VAULT_DIR, subPath, item.id),
                    originalName: item.original
                });
            }
        }
    }

    private async processNext() {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const task = this.queue.shift()!;
        console.log(`[Queue] Processing: ${task.originalName}`);

        let rawTmp: string | null = null;
        let normTmp: string | null = null;

        try {
            const meta = await getMeta(task.folder);
            const dp = vaultDataPath(task.folder);
            const nonce = Buffer.from(meta.nonce, 'base64');
            const { TMP_DIR } = await import('./config.js');

            let decryptKey: Buffer | null = null;

            if (meta.isEncrypted) {
                if (!task.encryptionKey) {
                    throw new Error("Missing decryption key");
                }
                decryptKey = Buffer.from(task.encryptionKey, 'hex');
            }

            rawTmp = path.join(TMP_DIR, `${task.id}_raw.mp4`);
            normTmp = path.join(TMP_DIR, `${task.id}_norm.mp4`);

            // 🔥 FIX: proper decryption
            if (decryptKey) {
                const decipher = getDecipherAtOffset(decryptKey, nonce, 0);
                await pipeline(
                    fs.createReadStream(dp),
                    decipher,
                    fs.createWriteStream(rawTmp)
                );
            } else {
                await fs.copy(dp, rawTmp);
            }

            // 🔥 Validate input file
            const rawStats = await fs.stat(rawTmp);
            if (rawStats.size < 100000) {
                throw new Error("Raw file too small (corrupt)");
            }

            // 🔥 Normalize safely
            const isMKV = task.originalName.toLowerCase().endsWith('.mkv');
            await normalizeVideo(rawTmp, normTmp, isMKV);

            const normStats = await fs.stat(normTmp);
            if (normStats.size < 100000) {
                throw new Error("Normalization failed (empty output)");
            }

            // 🔥 Probe
            const duration = await getVideoDuration(normTmp);
            if (!duration || duration <= 0) {
                throw new Error("Invalid duration");
            }

            // 🔥 Re-encrypt
            const newNonce = crypto.randomBytes(16);

            if (decryptKey) {
                const encryptor = getCipherAtOffset(decryptKey, newNonce, 0);
                await pipeline(
                    fs.createReadStream(normTmp),
                    encryptor,
                    fs.createWriteStream(dp)
                );
            } else {
                await fs.copy(normTmp, dp);
            }

            // 🔥 Update metadata
            meta.nonce = newNonce.toString('base64');
            meta.size = (await fs.stat(dp)).size;
            meta.duration = duration;
            meta.status = "ready";

            await saveMeta(task.folder, meta);

            // 🔥 Re-index
            const offsets = await indexMoofOffsets(dp, newNonce);
            await fs.writeJson(path.join(task.folder, "hls_index.json"), offsets);

            console.log(`[Queue] Success: ${task.originalName} (${duration.toFixed(2)}s)`);

        } catch (err: any) {
            console.error(`[Queue] Failed ${task.id}:`, err.message);

            try {
                const meta = await getMeta(task.folder);
                meta.status = "error";
                await saveMeta(task.folder, meta);
            } catch {}

        } finally {
            // 🔥 ALWAYS cleanup
            if (rawTmp && await fs.pathExists(rawTmp)) await fs.remove(rawTmp);
            if (normTmp && await fs.pathExists(normTmp)) await fs.remove(normTmp);
        }

        setTimeout(() => this.processNext(), 500); // 🔥 faster + safer loop
    }
}

export const repairQueue = new BackgroundQueue();
