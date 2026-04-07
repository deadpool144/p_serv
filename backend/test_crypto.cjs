const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const ACCESS_KEY = '123456';
const KEY_BUFFER = crypto.createHash('sha256').update(ACCESS_KEY).digest();

async function test() {
    const id = 'ul_1775486923229_w147'; 
    const vaultDir = `c:/Users/Lenovo/Desktop/new_pc_serv/p_serv/vault/videos/${id}`;
    const meta = await fs.readJson(path.join(vaultDir, 'meta.json'));
    const dp = path.join(vaultDir, 'data.enc');
    const nonce = Buffer.from(meta.nonce, 'base64');
    
    console.log(`[Diagnostic] Nonce: ${meta.nonce} / Length: ${nonce.length}`);

    const enc = await fs.readFile(dp);
    const head = enc.slice(0, 16);

    // Node CTR test
    const nodeDecipher = crypto.createDecipheriv('aes-256-ctr', KEY_BUFFER, nonce);
    const nodeDecrypted = Buffer.concat([nodeDecipher.update(head), nodeDecipher.final()]);
    console.log(`[Node CTR Decrypted] First 4 Bytes: ${nodeDecrypted.slice(0, 4).toString('hex')}`);
    
    // Check if the nonce is in the first 16 bytes of the file itself?
    if (head.equals(nonce)) {
        console.log("[Diagnostic] First 16 bytes ARE the nonce. Skiping...");
    }
}

test().catch(console.error);
