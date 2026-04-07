import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { FileData } from '../components/FileCard';
import FileGrid from '../components/FileGrid';
import type { Playlist } from '../components/PlaylistSidebar';

interface PlaylistPageProps {
    token: string;
    playlists: Playlist[];
    onRefresh: () => void;
}

const PlaylistPage: React.FC<PlaylistPageProps> = ({ token, playlists, onRefresh }) => {
    const { id } = useParams<{ id: string }>();
    const [playlistFiles, setPlaylistFiles] = useState<FileData[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const currentPlaylist = playlists.find(p => p.id === id);

    useEffect(() => {
        const fetchItems = async () => {
            if (!currentPlaylist) return;
            setLoading(true);
            try {
                // We fetch all files and filter them by ID in the playlist
                // In a production app, we would have a specific endpoint for this
                const res = await fetch(`/api/files?token=${token}&type=music`);
                const data = await res.json();
                if (res.ok) {
                    const filtered = data.items.filter((f: any) => currentPlaylist.items.includes(f.id));
                    setPlaylistFiles(filtered);
                }
            } catch (err) {
                console.error("Playlist items fail:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchItems();
    }, [id, currentPlaylist, token]);

    const handleRemoveFromPlaylist = async (fileId: string) => {
        try {
            const res = await fetch(`/api/playlists/${id}/remove/${fileId}?token=${token}`, {
                method: 'DELETE'
            });
            if (res.ok) onRefresh();
        } catch (err) {
            console.error("Remove fail:", err);
        }
    };

    if (!currentPlaylist) return <div className="main-content">Playlist not found.</div>;

    return (
        <div className="playlist-page">
            <header className="playlist-view-header" style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2.5rem' }}>{currentPlaylist.name}</h1>
                    <p style={{ color: 'var(--text3)', marginTop: '0.5rem' }}>{playlistFiles.length} Tracks · Private Collection</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button 
                        className="upload-btn-sidebar" 
                        style={{ height: '50px', padding: '0 2rem', opacity: 0.7, background: 'rgba(255,50,50,0.1)', color: '#ff4444', border: '1px solid rgba(255,50,50,0.2)' }}
                        onClick={async () => {
                            if (window.confirm(`Delete playlist "${currentPlaylist.name}"?`)) {
                                try {
                                    const res = await fetch(`/api/playlists/${id}?token=${token}`, { method: 'DELETE' });
                                    if (res.ok) {
                                        onRefresh();
                                        navigate('/');
                                    }
                                } catch (err) { console.error(err); }
                            }
                        }}
                    >
                        Delete Playlist
                    </button>
                    <button 
                        className="upload-btn-sidebar" 
                        style={{ height: '50px', padding: '0 2rem' }}
                        onClick={() => {
                           if (playlistFiles.length > 0) {
                               navigate(`/view/${playlistFiles[0].id}?playlist=${id}`);
                           }
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '8px' }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        Play All
                    </button>
                </div>
            </header>

            <div style={{ padding: '1rem' }}>
               {loading ? (
                   <p>Loading tracks...</p>
               ) : (
                   <FileGrid 
                       files={playlistFiles}
                       token={token}
                       onView={(file) => navigate(`/view/${file.id}?playlist=${id}`)}
                       onDelete={handleRemoveFromPlaylist} // Using onDelete as 'Remove from Playlist' here
                       viewTitle="Playlist Tracks"
                   />
               )}
            </div>
        </div>
    );
};

export default PlaylistPage;
