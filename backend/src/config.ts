import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ROOT_DIR = path.resolve(__dirname, '../../');

export const PORT = parseInt(process.env.PORT || '5001');
export const SECRET_KEY = process.env.SECRET_KEY || 'default_secret';
export const ACCESS_KEY = process.env.ACCESS_KEY || 'default_access';
export const TOKEN_TTL = parseInt(process.env.TOKEN_TTL || '86400'); // 24h

export const VAULT_DIR = process.env.VAULT_DIR || path.join(ROOT_DIR, 'vault');
export const PLAYLIST_FILE = path.join(VAULT_DIR, 'playlists.json');
export const THUMBNAIL_DIR = path.join(ROOT_DIR, 'thumbnails');
export const TMP_DIR = path.join(ROOT_DIR, 'temp');

export const FOLDERS = {
    vault: VAULT_DIR,
    thumbnails: THUMBNAIL_DIR,
    temp: TMP_DIR
};

import crypto from 'crypto';
export const KEY_BUFFER = crypto.createHash('sha256').update(ACCESS_KEY).digest();
