import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveUpload, getUploadFile } from '$lib/server/upload';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }
    
    const result = await saveUpload(file);
    
    return json({
      id: result.id,
      filename: result.filename,
      mimeType: result.mimeType,
      size: result.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    return json({ 
      error: error instanceof Error ? error.message : 'Upload failed' 
    }, { status: 500 });
  }
};
