import React, { useRef, useState, useEffect } from 'react';

interface AudioPlayerProps {
    fileId: string;
    fileName: string;
    token: string;
    onNext?: () => void;
    onPrev?: () => void;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ fileId, fileName, token, onNext, onPrev }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [error, setError] = useState<string | null>(null);

    // Sync state with actual audio element (handles autoplay blocks)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onPlay = () => {
            setIsPlaying(true);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
        };
        const onPause = () => {
            setIsPlaying(false);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
        };
        const onError = () => {
            const error = audio.error;
            setError(`Playback failed (Error ${error?.code || 'Unknown'}).`);
        };

        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('error', onError);

        // Media Session Metadata & Actions
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: fileName,
                artist: 'SecurVault Music',
                artwork: [
                    { src: `/api/thumbnail/${fileId}?token=${token}`, sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', togglePlay);
            navigator.mediaSession.setActionHandler('pause', togglePlay);
            if (onNext) navigator.mediaSession.setActionHandler('nexttrack', onNext);
            if (onPrev) navigator.mediaSession.setActionHandler('previoustrack', onPrev);
        }

        return () => {
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('error', onError);
            if ('mediaSession' in navigator) {
                navigator.mediaSession.setActionHandler('play', null);
                navigator.mediaSession.setActionHandler('pause', null);
                navigator.mediaSession.setActionHandler('nexttrack', null);
                navigator.mediaSession.setActionHandler('previoustrack', null);
            }
        };
    }, [fileId, fileName, token, onNext, onPrev]);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play().catch(() => {
                    setError("Autoplay blocked. Click to play.");
                });
            }
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
            setError(null);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (audioRef.current) {
            audioRef.current.currentTime = time;
            setCurrentTime(time);
        }
    };

    const formatTime = (time: number) => {
        if (isNaN(time)) return "0:00";
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="audio-player-container">
            <div className={`audio-visual-box ${isPlaying ? 'playing' : ''}`}>
                <img
                    src={`/api/thumbnail/${fileId}?token=${token}`}
                    alt="Album Art"
                    className="audio-cover-art"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://www.gstatic.com/images/icons/material/system/2x/music_note_white_48dp.png';
                    }}
                />
                <div className="audio-glass-overlay"></div>
                {error && <div className="audio-error-overlay">{error}</div>}
            </div>

            <div className="audio-controls-main">
                <div className="audio-info-text">
                    <h3 className="audio-title">{fileName}</h3>
                </div>

                <div className="audio-progress-row">
                    <span className="time-text">{formatTime(currentTime)}</span>
                    <input
                        type="range"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={handleSeek}
                        className="audio-seekbar"
                    />
                    <span className="time-text">{formatTime(duration)}</span>
                </div>

                <div className="audio-buttons-row">
                    <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
                        <button className="icon-btn-sm" onClick={onPrev} title="Previous">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="19 20 9 12 19 4 19 20" fill="currentColor" /><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2.5" /></svg>
                        </button>

                        <button className="audio-main-btn" onClick={togglePlay}>
                            {isPlaying ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                            )}
                        </button>

                        <button className="icon-btn-sm" onClick={onNext} title="Next">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 4 15 12 5 20 5 4" fill="currentColor" /><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.5" /></svg>
                        </button>
                    </div>

                    <div className="audio-volume-group">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={volume}
                            onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                setVolume(v);
                                if (audioRef.current) audioRef.current.volume = v;
                            }}
                            className="audio-vol-bar"
                        />
                    </div>
                </div>
            </div>

            <audio
                ref={audioRef}
                crossOrigin="anonymous"
                src={`/api/preview/${fileId}?token=${token}`}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => {
                    if (onNext) onNext();
                    else setIsPlaying(false);
                }}
                autoPlay
            />
        </div>
    );
};

export default AudioPlayer;
