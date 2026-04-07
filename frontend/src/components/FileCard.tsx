import React from 'react';

export interface FileData {
    id: string;
    name: string;
    size: number;
    type: string;
    thumb: boolean;
    created: number;
    status?: "ready" | "processing" | "error";
}

interface FileCardProps {
    file: FileData;
    onView: (file: FileData) => void;
    onDelete: (id: string | any) => void;
    onAddToPlaylist?: (file: FileData) => void;
    token: string;
}

const FileCard: React.FC<FileCardProps> = ({ file, onView, onDelete, onAddToPlaylist, token }) => {
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/') || file.type.includes('matroska') || file.name.toLowerCase().endsWith('.mkv');

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const isProcessing = file.status === 'processing';

    return (
        <div 
            className={`file-card ${isProcessing ? 'processing' : ''}`} 
            onClick={() => !isProcessing && onView(file)}
        >
            <div className="card-thumb">
                {file.thumb ? (
                    <img 
                        src={`/api/thumbnail/${file.id}?token=${token}`} 
                        alt={file.name} 
                        loading="lazy"
                    />
                ) : (
                    <div className="file-icon">
                        {isVideo ? '🎬' : isImage ? '🖼️' : '📄'}
                    </div>
                )}
                
                {isVideo && !isProcessing && (
                    <div className="play-overlay">
                        <div className="play-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                    </div>
                )}

                {isProcessing && (
                    <div className="processing-overlay">
                        <div className="loader-mini"></div>
                        <span>Processing...</span>
                    </div>
                )}
            </div>
            
            <div className="card-info">
                <span className="file-name" title={file.name}>{file.name}</span>
                <span className="file-meta">{file.type.split('/')[1]?.toUpperCase() || 'FILE'} · {formatSize(file.size)}</span>
            </div>

            <div className="card-actions">
                {onAddToPlaylist && file.type.startsWith('audio/') && (
                    <button 
                        className="action-btn" 
                        onClick={(e) => { e.stopPropagation(); onAddToPlaylist(file); }}
                        title="Add to Playlist"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M9 17v-3M15 17v-3M2 4h20v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4zM2 8h20" /></svg>
                    </button>
                )}
                <button 
                    className="action-btn" 
                    onClick={(e) => { e.stopPropagation(); window.open(`/api/download/${file.id}?token=${token}`); }}
                    title="Download"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button 
                    className="action-btn btn-del" 
                    onClick={(e) => { e.stopPropagation(); onDelete(file.id); }}
                    title="Delete"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        </div>
    );
};

export default FileCard;
