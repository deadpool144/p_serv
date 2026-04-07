import React, { useState } from 'react';

export interface Playlist {
    id: string;
    name: string;
    items: string[];
}

interface PlaylistSidebarProps {
    playlists: Playlist[];
    onSelect: (id: string) => void;
    onCreate: (name: string) => void;
    onDelete: (id: string) => void;
    activeId?: string;
}

const PlaylistSidebar: React.FC<PlaylistSidebarProps> = ({ 
    playlists, 
    onSelect, 
    onCreate, 
    onDelete,
    activeId 
}) => {
    const [newName, setNewName] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim()) return;
        onCreate(newName.trim());
        setNewName('');
    };

    return (
        <div className="playlist-panel-inner">
            <div className="playlist-header">
                <h3>Music Playlists</h3>
            </div>

            <div className="playlist-list">
                {playlists.length === 0 ? (
                    <div style={{ color: 'var(--text3)', fontSize: '0.85rem', padding: '1rem' }}>
                        No playlists yet. Create one below!
                    </div>
                ) : (
                    playlists.map(pl => (
                        <div 
                            key={pl.id} 
                            className={`playlist-item ${activeId === pl.id ? 'active' : ''}`}
                            onClick={() => onSelect(pl.id)}
                        >
                            <div className="pl-info">
                                <span className="pl-name">{pl.name}</span>
                                <span className="pl-count">{pl.items.length} tracks</span>
                            </div>
                            <div className="pl-actions">
                                <button 
                                    className="icon-btn-sm" 
                                    style={{ width: '32px', height: '32px', background: 'none', border: 'none', color: 'var(--text3)' }}
                                    onClick={(e) => { e.stopPropagation(); onDelete(pl.id); }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <form className="pl-add-form" onSubmit={handleSubmit}>
                <input 
                    type="text" 
                    className="pl-input" 
                    placeholder="New Playlist Name..." 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <button type="submit" className="pl-btn-sm" title="Add Playlist">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
            </form>
        </div>
    );
};

export default PlaylistSidebar;
