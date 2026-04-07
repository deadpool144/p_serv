import express from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import { PORT, FOLDERS, TMP_DIR } from './config.js';
import routes from './routes';
import fs from 'fs-extra';

const app = express();

// Initialize folders
Object.values(FOLDERS).forEach(async (path) => {
    await fs.ensureDir(path as string);
});

app.use(cors());
app.use(express.json());

// Safety middleware for malformed JSON
app.use((err: any, req: any, res: any, next: any) => {
    if (err instanceof SyntaxError && 'body' in err) {
        console.error('[Safety] Malformed JSON request blocked');
        return res.status(400).json({ error: 'Malformed JSON' });
    }
    next();
});
app.use(fileUpload({
    limits: { fileSize: 2000 * 1024 * 1024 }, // 2GB
    useTempFiles: true,
    tempFileDir: TMP_DIR,
    debug: false,
    preserveExtension: true,
    abortOnLimit: true
}));

// API Routes
app.use('/api', routes);

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`[Server] Express (TS) on http://0.0.0.0:${PORT}`);

    // Start background processing for any pending tasks
    try {
        const { repairQueue } = await import('./queue.js');
        await repairQueue.requeuePendingTasks();
    } catch (err) {
        console.error("[Server] Failed to start repair queue:", err);
    }
});
