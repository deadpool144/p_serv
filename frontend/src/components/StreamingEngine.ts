/**
 * Ultra-Smooth Chunked Streaming Engine (MSE)
 * Manages video buffering, pre-fetching, and memory management.
 * Includes aggressive fallback to native streaming if MSE fails.
 */
export class StreamingEngine {
    private mediaSource: MediaSource;
    private sourceBuffer: SourceBuffer | null = null;
    private videoElement: HTMLVideoElement;
    private url: string;
    private fileSize: number;
    private chunkSize: number = 1024 * 1024; // 1MB segments for faster initial load
    private loadedChunks: Set<number> = new Set();
    private isAppending: boolean = false;
    private appendQueue: ArrayBuffer[] = [];
    private abortController: AbortController | null = null;
    private isDestroyed: boolean = false;
    private fallbackTimer: any = null;
    private onFallback: () => void;

    constructor(videoElement: HTMLVideoElement, url: string, fileSize: number, onFallback: () => void) {
        this.videoElement = videoElement;
        this.url = url;
        this.fileSize = fileSize;
        this.onFallback = onFallback;
        this.mediaSource = new MediaSource();
        
        console.log('MSE: Initializing MediaSource');
        this.videoElement.src = URL.createObjectURL(this.mediaSource);
        this.mediaSource.addEventListener('sourceopen', () => this.onSourceOpen());

        // Aggressive Fallback: 1.5s is enough for local MSE to open
        this.fallbackTimer = setTimeout(() => {
            if (this.mediaSource.readyState !== 'open' && !this.isDestroyed) {
                console.warn('MSE: SourceOpen timeout, falling back');
                this.triggerFallback();
            }
        }, 1500);
    }

    private triggerFallback() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
        this.onFallback();
        // The VideoPlayer will handle re-assigning src
    }

    private async onSourceOpen() {
        if (this.sourceBuffer || this.isDestroyed) return;
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);

        // Try standard Chrome/Safari codecs
        const codecs = [
            'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
            'video/mp4; codecs="avc1.640028, mp4a.40.2"',
            'video/mp4; codecs="avc1.4d401e, mp4a.40.2"'
        ];

        let supportedCodec = codecs.find(c => MediaSource.isTypeSupported(c));
        
        if (!supportedCodec) {
            console.warn('MSE: No supported codecs found');
            this.triggerFallback();
            return;
        }

        try {
            this.sourceBuffer = this.mediaSource.addSourceBuffer(supportedCodec);
            this.sourceBuffer.mode = 'segments';
            this.sourceBuffer.addEventListener('updateend', () => {
                this.isAppending = false;
                this.processAppendQueue();
            });
            this.sourceBuffer.addEventListener('error', (e) => {
                console.error('MSE: SourceBuffer error', e);
                this.triggerFallback();
            });

            // Initial load immediately
            await this.loadChunk(0);
        } catch (err) {
            console.error('MSE: Error adding SourceBuffer', err);
            this.triggerFallback();
        }
    }

    private async loadChunk(chunkIndex: number) {
        if (this.loadedChunks.has(chunkIndex) || this.isDestroyed) return;
        
        const start = chunkIndex * this.chunkSize;
        const end = Math.min(start + this.chunkSize - 1, this.fileSize - 1);
        if (start >= this.fileSize) return;

        this.abortController = new AbortController();

        try {
            const response = await fetch(this.url, {
                headers: { 'Range': `bytes=${start}-${end}` },
                signal: this.abortController.signal
            });

            if (!response.ok && response.status !== 206) throw new Error('Range fetch failed');

            const data = await response.arrayBuffer();
            if (this.isDestroyed) return;

            this.loadedChunks.add(chunkIndex);
            
            // For the first chunk (index 0), check if it's fMP4
            if (chunkIndex === 0 && data.byteLength < 100) {
                 // Too small for fMP4 header?
                 console.warn('MSE: First chunk too small, possible non-fMP4');
            }

            this.appendToBuffer(data);
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error('MSE: Load error', err);
                this.triggerFallback();
            }
        }
    }

    private appendToBuffer(data: ArrayBuffer) {
        if (this.isAppending || !this.sourceBuffer || this.sourceBuffer.updating) {
            this.appendQueue.push(data);
        } else {
            try {
                this.isAppending = true;
                this.sourceBuffer.appendBuffer(data);
            } catch (err) {
                console.error('MSE: Append failed', err);
                this.triggerFallback();
            }
        }
    }

    private processAppendQueue() {
        if (this.appendQueue.length > 0 && this.sourceBuffer && !this.sourceBuffer.updating) {
            const data = this.appendQueue.shift()!;
            this.isAppending = true;
            this.sourceBuffer.appendBuffer(data);
        }
    }

    public async checkBuffer() {
        if (!this.sourceBuffer || this.isAppending || this.isDestroyed) return;

        const currentTime = this.videoElement.currentTime;
        const buffered = this.videoElement.buffered;
        let bufEnd = 0;
        for (let i = 0; i < buffered.length; i++) {
            if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
                bufEnd = buffered.end(i);
                break;
            }
        }

        // Keep 20s ahead
        if (bufEnd - currentTime < 15 && bufEnd < this.videoElement.duration) {
            const nextIdx = Math.floor((bufEnd * (this.fileSize / (this.videoElement.duration || 1))) / this.chunkSize) + 1;
            if (!this.loadedChunks.has(nextIdx)) await this.loadChunk(nextIdx);
        }
    }

    public async seekTo(time: number) {
        if (this.isDestroyed || !this.videoElement.duration) return;
        const bytePos = (time / this.videoElement.duration) * this.fileSize;
        const idx = Math.floor(bytePos / this.chunkSize);
        if (!this.loadedChunks.has(idx)) await this.loadChunk(idx);
    }

    public destroy() {
        this.isDestroyed = true;
        this.abortController?.abort();
        if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
        if (this.mediaSource.readyState === 'open') {
            try { this.mediaSource.endOfStream(); } catch {}
        }
    }
}
