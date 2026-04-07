import React, { useState } from 'react';

interface UploadModalProps {
    onClose: () => void;
    onUploadComplete: () => void;
    token: string;
}

const UploadModal: React.FC<UploadModalProps> = ({ onClose, onUploadComplete, token }) => {
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isEncrypted, setIsEncrypted] = useState(true);
    const [shouldRandomize, setShouldRandomize] = useState(true);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);
        setProgress(0);

        const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const fileId = "ul_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6);

        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('file_id', fileId);
            formData.append('chunk_index', i.toString());
            formData.append('total_chunks', totalChunks.toString());
            formData.append('filename', file.name);
            formData.append('offset', start.toString());
            formData.append('is_encrypted', isEncrypted.toString());
            formData.append('should_randomize', shouldRandomize.toString());

            try {
                const response = await fetch(`/api/upload-chunk?token=${token}`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) throw new Error('Upload failed');
                
                setProgress(Math.round(((i + 1) / totalChunks) * 100));
            } catch (err) {
                console.error(err);
                setUploading(false);
                return;
            }
        }

        setUploading(false);
        onUploadComplete();
        onClose();
    };

    return (
        <div id="upload-modal" className="modal">
            <div className="modal-card">
                <button className="modal-close" onClick={onClose}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <h3>Secure Upload</h3>
                <p className="modal-sub">Files are encrypted locally before storage</p>
                
                {!uploading ? (
                    <>
                        <label htmlFor="file-input" className="drop-zone" id="drop-zone">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                            <span>{file ? file.name : "Tap to select file"}</span>
                        </label>
                        <input type="file" id="file-input" className="hidden" onChange={handleFileChange} />
                        
                        <div className="upload-options">
                            <label className="checkbox-container">
                                <input 
                                    type="checkbox" 
                                    checked={isEncrypted} 
                                    onChange={(e) => setIsEncrypted(e.target.checked)} 
                                />
                                <span className="checkmark"></span>
                                <div className="option-text">
                                    <span className="option-label">Encrypt File</span>
                                    <span className="option-hint">AES-256-CTR Protection</span>
                                </div>
                            </label>

                            <label className="checkbox-container">
                                <input 
                                    type="checkbox" 
                                    checked={shouldRandomize} 
                                    onChange={(e) => setShouldRandomize(e.target.checked)} 
                                />
                                <span className="checkmark"></span>
                                <div className="option-text">
                                    <span className="option-label">Randomize Name</span>
                                    <span className="option-hint">Shadow-identity masking</span>
                                </div>
                            </label>
                        </div>
                        
                        <div className="modal-actions">
                            <button 
                                className="btn-primary" 
                                disabled={!file} 
                                onClick={handleUpload}
                            >
                                Start Upload
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="upload-progress">
                        <div className="ring-wrap" style={{ position: 'relative', width: '80px', height: '80px', margin: '0 auto' }}>
                            <svg className="ring" viewBox="0 0 80 80" style={{ width: '100%', height: '100%' }}>
                                <circle className="ring-bg" cx="40" cy="40" r="34" fill="none" stroke="var(--bg3)" strokeWidth="4" />
                                <circle 
                                    className="ring-fill" 
                                    cx="40" cy="40" r="34" 
                                    fill="none" stroke="var(--accent)" strokeWidth="4"
                                    strokeDasharray="213.6"
                                    strokeDashoffset={213.6 - (213.6 * progress) / 100}
                                    style={{ transition: 'stroke-dashoffset 0.3s' }}
                                />
                            </svg>
                            <span id="ring-pct" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>{progress}%</span>
                        </div>
                        <div className="upload-stats" style={{ marginTop: '1rem' }}>
                            <span className="upload-fname" title={file?.name}>{file?.name}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UploadModal;
