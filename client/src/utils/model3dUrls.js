export const getModel3dBaseUrl = () => {
  const configured = import.meta.env.VITE_MODEL3D_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');

  if (import.meta.env.PROD) return '/model3d';

  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  return `${protocol}//${hostname}:3001`;
};

export const MODEL3D_BASE_URL = getModel3dBaseUrl();

export const resolveModelUrl = (rawUrl) => {
  if (!rawUrl || rawUrl === 'undefined' || rawUrl === 'null') return null;

  const url = String(rawUrl).trim();
  if (!url || url === 'undefined' || url === 'null') return null;
  if (url.startsWith('blob:') || url.startsWith('data:')) return url;
  if (url.startsWith('/model3d/')) return url;

  const baseUrl = MODEL3D_BASE_URL.replace(/\/+$/, '');
  if (url.startsWith('/uploads/')) return `${baseUrl}${url}`;

  if (!/^https?:\/\//i.test(url)) {
    return `${baseUrl}/${url.replace(/^\/+/, '')}`;
  }

  try {
    const parsed = new URL(url);
    const isLocalHost = ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
    if (import.meta.env.PROD && isLocalHost && parsed.pathname.startsWith('/uploads/')) {
      return `/model3d${parsed.pathname}`;
    }
  } catch {
    return null;
  }

  return url;
};

export const getModelRenderUrl = (model) => {
  if (!model) return null;

  if (model.fileUrl) return resolveModelUrl(model.fileUrl);

  const candidatePath = model.filePath || model.path || model.filename;
  if (!candidatePath) return null;

  const normalized = String(candidatePath).replace(/\\/g, '/');
  const filename = normalized.split('/').filter(Boolean).pop();
  return filename ? resolveModelUrl(`/uploads/models/${filename}`) : null;
};
