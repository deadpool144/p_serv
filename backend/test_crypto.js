import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';

const ACCESS_KEY = '123456';
const KEY_BUFFER = crypto.createHash('sha256').update(ACCESS_KEY).digest();

async function test() {
    const id = 'ul_1775486923229_w147'; 
    const vaultDir = `c:/Users/Lenovo/Desktop/new_pc_serv/p_serv/vault/videos/${id}`;
    const meta = await fs.readJson(path.join(vaultDir, 'meta.json'));
    const dp = path.join(vaultDir, 'data.enc');
    const nonce = Buffer.from(meta.nonce, 'base64');
    
    const enc = await fs.readFile(dp);
    const head = enc.slice(0, 1024);

    // Manual CTR Test (First Block)
    const cipher = crypto.createCipheriv('aes-256-ecb', KEY_BUFFER, null);
    const keyStream = cipher.update(nonce); // AES-ECB of the nonce is the first CTR block key
    
    const manualDecrypted = Buffer.alloc(16);
    for (let i = 0; i < 16; i++) {
        manualDecrypted[i] = head[i] ^ keyStream[i];
    }
    
    console.log(`[Manual CTR] Head: ${manualDecrypted.slice(0, 4).toString('hex')}`);
    console.log(`[Manual CTR] MKV? ${manualDecrypted.slice(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))}`);
    
    // Check with Node's createDecipheriv
    const nodeDecipher = crypto.createDecipheriv('aes-256-ctr', KEY_BUFFER, nonce);
    const nodeDecrypted = Buffer.concat([nodeDecipher.update(head.slice(0, 16)), nodeDecipher.final()]);
    console.log(`[Node CTR] Head: ${nodeDecrypted.slice(0, 4).toString('hex')}`);
    
    // If still NO, let's check if the Nonce was 8 bytes or something?
}

test();
