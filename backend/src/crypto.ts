import crypto from 'crypto';

/**
 * Replicates the Python get_cipher_at_offset logic using Node.js crypto.
 * Python's AES-CTR with a custom counter is symmetric.
 */
export function getCipherAtOffset(key: Buffer, nonce: Buffer, offset: number) {
    // 1. Convert nonce bytes (16) to BigInt
    const hexNonce = nonce.toString('hex');
    const intNonce = BigInt('0x' + hexNonce);

    // 2. Adjust counter for block offset
    const blockOffset = BigInt(Math.floor(offset / 16));
    const newCounterInt = (intNonce + blockOffset) % (BigInt(1) << BigInt(128));

    // 3. Convert back to 16-byte buffer (big-endian)
    const newNonceHex = newCounterInt.toString(16).padStart(32, '0');
    const newNonce = Buffer.from(newNonceHex, 'hex');

    // In 'aes-256-ctr', the second param is the initial counter/nonce
    const cipher = crypto.createDecipheriv('aes-256-ctr', key, newNonce);
    
    // IMPORTANT: Handle the block-inner remainder
    const remainder = offset % 16;
    if (remainder > 0) {
        // Increment the internal counter by 'remainder' bytes. 
        // In Node.js, we can update with zeros and discard the output.
        cipher.update(Buffer.alloc(remainder));
    }
    
    return cipher;
}

export function getAesKey(secret: string): Buffer {
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Combines the Server Secret and User Key for a 2-Factor Key.
 */
export function deriveFinalKey(serverSecret: string, userKey: string): Buffer {
    return crypto.createHash('sha256').update(serverSecret + userKey).digest();
}

export function processChunk(data: Buffer, key: Buffer, nonce: Buffer, offset: number): Buffer {
    const cipher = getCipherAtOffset(key, nonce, offset);
    return Buffer.concat([cipher.update(data), cipher.final()]);
}

export const getDecipherAtOffset = getCipherAtOffset;
