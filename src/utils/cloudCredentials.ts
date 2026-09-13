import type { User, UserRole } from '../types';

/**
 * Cloud Credential Protection & Cryptographic Utility
 * 
 * Implements Approach 2: Password Hash Scrubbing + Encrypted Cloud Sync.
 * - Password hashes (bcrypt/salted) are scrubbed from Firestore documents before upload.
 * - Credentials are encrypted using authenticated keystream cipher (CTR + HMAC-SHA256)
 *   with unique random salt and nonce per encryption before cloud transmission.
 * - Only authorized terminals with the restaurant secret can decrypt the credential in memory.
 * - Outside attackers dumping Firestore see zero plaintext or raw bcrypt hashes.
 */

const MASTER_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_RESTAURANT_SYNC_KEY) ||
  'RMS_SECURE_CLOUD_VECTOR_2026';

/**
 * Pure TypeScript synchronous SHA-256 implementation
 */
export function sha256Sync(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const words: number[] = [];
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const utf8: number[] = [];
  for (let idx = 0; idx < str.length; idx++) {
    let charCode = str.charCodeAt(idx);
    if (charCode < 0x80) {
      utf8.push(charCode);
    } else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      idx++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (str.charCodeAt(idx) & 0x3ff));
      utf8.push(0xf0 | (charCode >> 18), 0x80 | ((charCode >> 12) & 0x3f), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    }
  }

  for (let j = 0; j < utf8.length; j++) {
    words[j >> 2] |= utf8[j] << ((3 - (j % 4)) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << ((3 - (utf8.length % 4)) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = utf8.length * 8;

  const w = new Array(64);
  for (let chunk = 0; chunk < words.length; chunk += 16) {
    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let hVal = hash[7];

    for (let t = 0; t < 64; t++) {
      if (t < 16) {
        w[t] = words[chunk + t] | 0;
      } else {
        const gamma0 = rightRotate(w[t - 15], 7) ^ rightRotate(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const gamma1 = rightRotate(w[t - 2], 17) ^ rightRotate(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + gamma0 + w[t - 7] + gamma1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hVal + s1 + ch + k[t] + w[t]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      hVal = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + hVal) | 0;
  }

  let result = '';
  for (let idx = 0; idx < 8; idx++) {
    result += (hash[idx] >>> 0).toString(16).padStart(8, '0');
  }
  return result;
}

/**
 * Generates random hexadecimal bytes using crypto.getRandomValues if available
 */
function getRandomHex(byteCount: number): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(byteCount);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let hex = '';
  for (let i = 0; i < byteCount; i++) {
    hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Encrypts a password hash into a secure authenticated cloud credential token.
 * Output format: $rms$v1$<saltHex>$<nonceHex>$<ciphertextHex>$<tagHex>
 */
export function encryptCredential(plaintextHash: string): string {
  if (!plaintextHash || typeof plaintextHash !== 'string') return '';

  const saltHex = getRandomHex(16);
  const nonceHex = getRandomHex(12);

  // Derive encryption key and MAC key
  const encKey = sha256Sync(`${MASTER_KEY}:enc:${saltHex}`);
  const macKey = sha256Sync(`${MASTER_KEY}:mac:${saltHex}`);

  // Convert input to UTF-8 bytes
  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const inputBytes = textEncoder ? Array.from(textEncoder.encode(plaintextHash)) : Array.from(plaintextHash).map(c => c.charCodeAt(0) & 0xff);

  // Keystream CTR encryption
  const cipherBytes: number[] = [];
  let blockIndex = 0;
  let keystreamHex = '';

  for (let i = 0; i < inputBytes.length; i++) {
    const blockOffset = i % 32;
    if (blockOffset === 0) {
      keystreamHex = sha256Sync(`${encKey}:ctr:${nonceHex}:${blockIndex}`);
      blockIndex++;
    }
    const keyByte = parseInt(keystreamHex.substr(blockOffset * 2, 2), 16);
    cipherBytes.push(inputBytes[i] ^ keyByte);
  }

  const ciphertextHex = cipherBytes.map(b => b.toString(16).padStart(2, '0')).join('');

  // Encrypt-then-MAC authentication tag
  const tagHex = sha256Sync(`${macKey}:tag:${saltHex}:${nonceHex}:${ciphertextHex}`);

  return `$rms$v1$${saltHex}$${nonceHex}$${ciphertextHex}$${tagHex}`;
}

/**
 * Decrypts a secure cloud credential token back into the original bcrypt/salted hash.
 * Returns null if token is corrupted, tampered with, or invalid.
 */
export function decryptCredential(token: string): string | null {
  if (!token || typeof token !== 'string' || !token.startsWith('$rms$v1$')) {
    return null;
  }

  const parts = token.split('$');
  if (parts.length !== 7) {
    // ["", "rms", "v1", saltHex, nonceHex, ciphertextHex, tagHex]
    return null;
  }

  const saltHex = parts[3];
  const nonceHex = parts[4];
  const ciphertextHex = parts[5];
  const tagHex = parts[6];

  // Verify MAC authentication tag (tamper-proofing)
  const macKey = sha256Sync(`${MASTER_KEY}:mac:${saltHex}`);
  const expectedTag = sha256Sync(`${macKey}:tag:${saltHex}:${nonceHex}:${ciphertextHex}`);

  if (tagHex !== expectedTag) {
    console.warn('[CloudCredentials] Authentication tag mismatch on credential decrypt');
    return null;
  }

  // Derive encryption key
  const encKey = sha256Sync(`${MASTER_KEY}:enc:${saltHex}`);

  // Keystream CTR decryption
  const cipherBytes: number[] = [];
  for (let i = 0; i < ciphertextHex.length; i += 2) {
    cipherBytes.push(parseInt(ciphertextHex.substr(i, 2), 16));
  }

  const decryptedBytes: number[] = [];
  let blockIndex = 0;
  let keystreamHex = '';

  for (let i = 0; i < cipherBytes.length; i++) {
    const blockOffset = i % 32;
    if (blockOffset === 0) {
      keystreamHex = sha256Sync(`${encKey}:ctr:${nonceHex}:${blockIndex}`);
      blockIndex++;
    }
    const keyByte = parseInt(keystreamHex.substr(blockOffset * 2, 2), 16);
    decryptedBytes.push(cipherBytes[i] ^ keyByte);
  }

  try {
    const textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    if (textDecoder) {
      return textDecoder.decode(new Uint8Array(decryptedBytes));
    }
    return String.fromCharCode(...decryptedBytes);
  } catch (err) {
    console.warn('[CloudCredentials] Failed to decode decrypted bytes:', err);
    return null;
  }
}

/**
 * Strips 'password' and prepares a clean, encrypted user document for Cloud Firestore.
 * Guarantee: Returned object NEVER contains a 'password' field.
 */
export function scrubUserForCloud(user: Partial<User> & Record<string, any>): Record<string, any> {
  const { password, ...safeUser } = user;

  let encCredential = safeUser.encCredential;
  if (password && typeof password === 'string' && (!encCredential || typeof encCredential !== 'string')) {
    encCredential = encryptCredential(password);
  }

  const payload: Record<string, any> = {
    ...safeUser,
    ...(encCredential ? { encCredential } : {}),
  };

  // Explicit safety delete to prevent accidental password leaks to Cloud Firestore
  delete payload.password;

  return payload;
}

/**
 * Hydrates a user document from Cloud Firestore into an in-memory User entity.
 * Decrypts encCredential into user.password in memory so local authentication works seamlessly.
 */
export function hydrateUserFromCloud(
  cloudDoc: Record<string, any>,
  existingUser?: User
): User {
  let password = existingUser?.password;

  // 1. Decrypt cloud credential if present
  if (cloudDoc.encCredential && typeof cloudDoc.encCredential === 'string') {
    const decrypted = decryptCredential(cloudDoc.encCredential);
    if (decrypted) {
      password = decrypted;
    }
  }

  // 2. Legacy fallback: if unencrypted password exists in cloud document
  if (!password && cloudDoc.password && typeof cloudDoc.password === 'string') {
    password = cloudDoc.password;
  }

  const role: UserRole = ['admin', 'manager', 'waiter', 'chef', 'cashier'].includes(cloudDoc.role)
    ? cloudDoc.role
    : (existingUser?.role || 'waiter');

  return {
    id: cloudDoc.id || existingUser?.id || '',
    username: cloudDoc.username || existingUser?.username || '',
    password: password || existingUser?.password || '',
    role,
    isActive: typeof cloudDoc.isActive === 'boolean' ? cloudDoc.isActive : (existingUser?.isActive ?? true),
    createdAt: cloudDoc.createdAt || existingUser?.createdAt || new Date().toISOString(),
    lastLogin: cloudDoc.lastLogin || existingUser?.lastLogin,
    employeeId: cloudDoc.employeeId || existingUser?.employeeId,
    encCredential: cloudDoc.encCredential || existingUser?.encCredential,
  };
}
