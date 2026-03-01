import type { RequestHandler } from './$types';
import { getUploadFile } from '$lib/server/upload';

export const GET: RequestHandler = async ({ params }) => {
  const { id } = params;
  
  const file = await getUploadFile(id);
  
  if (!file) {
    return new Response('Not found', { status: 404 });
  }
  
  return new Response(new Uint8Array(file.data), {
    headers: {
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${file.filename}"`,
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
};
