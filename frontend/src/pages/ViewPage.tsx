import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import Viewer from '../components/Viewer';
import type { FileData } from '../components/FileCard';

interface ViewPageProps {
    token: string;
}

const ViewPage: React.FC<ViewPageProps> = ({ token }) => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const playlistId = searchParams.get('playlist');
    const viewType = searchParams.get('type');

    const navigate = useNavigate();
    const [file, setFile] = useState<FileData | null>(null);
    const [queue, setQueue] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchContext = async () => {
            setLoading(true);
            try {
                // 1. Fetch current file
                const response = await fetch(`/api/file/${id}?token=${token}`);
                if (!response.ok) throw new Error('File not found');
                const data = await response.json();
                setFile(data);

                // 2. Resolve Queue (Playlist OR Category)
                if (playlistId) {
                    const plRes = await fetch(`/api/playlists?token=${token}`);
                    const playlists = await plRes.json();
                    const currentPl = playlists.find((p: any) => p.id === playlistId);
                    if (currentPl) {
                        setQueue(currentPl.items);
                    }
                } else if (viewType) {
                    const res = await fetch(`/api/files?token=${token}&type=${viewType}`);
                    const listData = await res.json();
                    if (res.ok) {
                        setQueue(listData.items.map((f: any) => f.id));
                    }
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id && token) {
            fetchContext();
        }
    }, [id, token, playlistId, viewType]);

    const handleNext = () => {
        if (queue.length === 0) return;
        const currentIdx = queue.indexOf(id!);
        if (currentIdx !== -1 && currentIdx < queue.length - 1) {
            const nextId = queue[currentIdx + 1];
            const params = playlistId ? `?playlist=${playlistId}` : `?type=${viewType}`;
            navigate(`/view/${nextId}${params}`);
        } else if (currentIdx === queue.length - 1) {
             navigate(playlistId ? `/playlist/${playlistId}` : '/');
        }
    };

    const handlePrev = () => {
        if (queue.length === 0) return;
        const currentIdx = queue.indexOf(id!);
        if (currentIdx > 0) {
            const prevId = queue[currentIdx - 1];
            const params = playlistId ? `?playlist=${playlistId}` : `?type=${viewType}`;
            navigate(`/view/${prevId}${params}`);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-white/50 animate-pulse font-mono tracking-widest uppercase">
                    Locating Entry...
                </div>
            </div>
        );
    }

    if (error || !file) {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center overflow-hidden relative">
                <div className="absolute inset-0 bg-red-950/10 mix-blend-overlay animate-pulse" />
                <div className="z-10 text-center space-y-6">
                    <h1 className="text-6xl font-black text-red-500/20 uppercase tracking-tighter">ERROR_404</h1>
                    <p className="text-white/50 max-w-xs font-mono text-sm leading-relaxed mx-auto italic">
                        Vault entry has been moved or corrupted within the encrypted sector.
                    </p>
                    <button 
                        onClick={() => navigate('/')}
                        className="px-8 py-3 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full text-xs font-bold uppercase tracking-widest transition-all"
                    >
                        Return to Vault
                    </button>
                </div>
            </div>
        );
    }

    const handleDelete = async (fileId: string) => {
        try {
            const response = await fetch(`/api/delete/${fileId}?token=${token}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                navigate('/');
            }
        } catch (err) {
            console.error('Delete failed:', err);
        }
    };

    return (
        <div className="min-h-screen bg-black relative">
            <Viewer 
                file={file} 
                token={token} 
                onClose={() => navigate(playlistId ? `/playlist/${playlistId}` : '/')} 
                onDelete={handleDelete}
                onNext={handleNext}
                onPrev={handlePrev}
            />
        </div>
    );
};

export default ViewPage;
