import { writeFile, mkdir, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { createUpload, getUpload } from './db';
import { env } from '$env/dynamic/private';

const UPLOAD_DIR = env.UPLOAD_DIR || './data/uploads';
const MAX_FILE_SIZE = parseInt(env.MAX_FILE_SIZE || '10485760'); // 10MB default
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Compression settings for WebSocket-safe images
// Reduced to avoid 1009 Message Too Big errors
const MAX_IMAGE_DIMENSION = 1024;  // Reduced from 1536
const JPEG_QUALITY = 75;            // Reduced from 80

export interface UploadResult {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { 
      valid: false, 
      error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` 
    };
  }
  
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}` 
    };
  }
  
  return { valid: true };
}

export function sanitizeFilename(filename: string): string {
  // Remove path components and sanitize
  const name = filename.split(/[/\\]/).pop() || 'file';
  // Remove special characters except dots, hyphens, underscores
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 255);
}

export async function saveUpload(file: File): Promise<UploadResult> {
  await ensureUploadDir();
  
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }
  
  const id = uuid();
  const sanitizedName = sanitizeFilename(file.name);
  
  // Read file content
  let buffer = Buffer.from(await file.arrayBuffer());
  let mimeType = file.type;
  let finalSize = file.size;
  
  // Compress images to avoid WebSocket size limits (Error 1009)
  // Aggressively compress ALL images including GIFs (animation loss acceptable)
  try {
    const compressed = await sharp(buffer)
      .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { 
        fit: 'inside', 
        withoutEnlargement: true 
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
    
    // ALWAYS use compressed version for WebSocket safety
    const originalKB = Math.round(buffer.length / 1024);
    const compressedKB = Math.round(compressed.length / 1024);
    console.log(`[Upload] ${file.name}: ${originalKB}KB -> ${compressedKB}KB`);
    
    buffer = compressed;
    mimeType = 'image/jpeg';
    finalSize = compressed.length;
    
    // Warn if still too large (>500KB as Base64 = ~666KB in JSON)
    if (compressed.length > 500000) {
      console.warn(`[Upload] WARNING: Image still large after compression: ${compressedKB}KB`);
    }
  } catch (e) {
    console.error('[Upload] Compression FAILED:', e);
    throw new Error(`Image compression failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
  }
  
  // Use .jpg extension for compressed images
  const ext = mimeType === 'image/jpeg' ? '.jpg' : (extname(file.name) || getExtensionFromMime(mimeType));
  const storedFilename = `${id}${ext}`;
  const storedPath = join(UPLOAD_DIR, storedFilename);
  
  await writeFile(storedPath, buffer);
  
  // Store in database
  createUpload(id, sanitizedName, mimeType, finalSize, storedFilename);
  
  return {
    id,
    filename: sanitizedName,
    mimeType: mimeType,
    size: finalSize
  };
}

export async function getUploadFile(id: string): Promise<{ 
  data: Buffer; 
  filename: string; 
  mimeType: string 
} | null> {
  const upload = getUpload(id) as { path: string; filename: string; mime_type: string } | undefined;
  
  if (!upload) {
    return null;
  }
  
  const filePath = join(UPLOAD_DIR, upload.path);
  
  try {
    const data = await readFile(filePath);
    return {
      data,
      filename: upload.filename,
      mimeType: upload.mime_type
    };
  } catch {
    return null;
  }
}

export async function getUploadAsBase64(id: string): Promise<{ 
  base64: string; 
  mimeType: string 
} | null> {
  const file = await getUploadFile(id);
  
  if (!file) {
    return null;
  }
  
  return {
    base64: file.data.toString('base64'),
    mimeType: file.mimeType
  };
}

export async function deleteUpload(id: string): Promise<boolean> {
  const upload = getUpload(id) as { path: string } | undefined;
  
  if (!upload) {
    return false;
  }
  
  const filePath = join(UPLOAD_DIR, upload.path);
  
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp'
  };
  return mimeToExt[mimeType] || '.bin';
}
