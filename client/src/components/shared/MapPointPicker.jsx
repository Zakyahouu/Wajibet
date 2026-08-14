import { useRef, useState } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';

// A single field value looks like: { imageUrl, xPercent, yPercent, radiusPercent }
// or null/undefined before an image has been uploaded.
export default function MapPointPicker({
  value, onChange, uploadUrl, authToken, accept, creationId,
  radiusMin = 1, radiusMax = 40, radiusDefault = 6,
}) {
  const { t } = useLanguage();
  const frameRef = useRef(null);
  const imgRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const point = value && typeof value === 'object' ? value : null;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError(t.imageExceeds10MB || 'Image exceeds 10MB limit.'); return; }
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('usage', 'content');
      fd.append('creationId', creationId || 'draft');
      const { data } = await axios.post(uploadUrl, fd, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      onChange({ imageUrl: data.url, xPercent: 50, yPercent: 50, radiusPercent: radiusDefault });
    } catch (err) {
      setError(err.response?.data?.message || t.uploadFailed || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Same object-fit: contain math the game engine itself uses at play time —
  // this MUST stay identical to Map Pin Geography's engine/game.js
  // getRenderedRect(), or a teacher's click here will land on a different
  // pixel than the same percentage does during actual gameplay.
  function getRenderedRect() {
    const frame = frameRef.current;
    const img = imgRef.current;
    const frameRect = frame.getBoundingClientRect();
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const containerW = frameRect.width;
    const containerH = frameRect.height;
    const containerRatio = containerW / containerH;
    const naturalRatio = naturalW / naturalH;
    let renderW, renderH, offsetX, offsetY;
    if (naturalRatio > containerRatio) {
      renderW = containerW; renderH = containerW / naturalRatio;
      offsetX = 0; offsetY = (containerH - renderH) / 2;
    } else {
      renderH = containerH; renderW = containerH * naturalRatio;
      offsetY = 0; offsetX = (containerW - renderW) / 2;
    }
    return { frameRect, renderW, renderH, offsetX, offsetY };
  }

  const handleClick = (e) => {
    if (!point || !imgRef.current?.naturalWidth) return;
    const rect = getRenderedRect();
    const clientX = e.clientX - rect.frameRect.left;
    const clientY = e.clientY - rect.frameRect.top;
    const xPercent = Math.max(0, Math.min(100, ((clientX - rect.offsetX) / rect.renderW) * 100));
    const yPercent = Math.max(0, Math.min(100, ((clientY - rect.offsetY) / rect.renderH) * 100));
    onChange({ ...point, xPercent, yPercent });
  };

  const handleRadiusChange = (e) => {
    if (!point) return;
    onChange({ ...point, radiusPercent: Number(e.target.value) });
  };

  if (!point) {
    return (
      <div className="space-y-2">
        <input
          type="file"
          accept={(accept || ['image/png', 'image/jpeg']).join(',')}
          onChange={handleUpload}
          disabled={uploading}
        />
        {uploading && <p className="text-xs text-gray-500">{t.uploadingDots || 'Uploading…'}</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  const rect = (frameRef.current && imgRef.current?.naturalWidth) ? getRenderedRect() : null;
  const radiusPx = rect ? (point.radiusPercent / 100) * Math.min(rect.renderW, rect.renderH) : 0;
  const markerLeftPx = rect ? rect.offsetX + (point.xPercent / 100) * rect.renderW : 0;
  const markerTopPx = rect ? rect.offsetY + (point.yPercent / 100) * rect.renderH : 0;

  return (
    <div className="space-y-2">
      <div
        ref={frameRef}
        onClick={handleClick}
        style={{
          position: 'relative', width: '100%', aspectRatio: '16/10',
          background: '#cfc4a0', borderRadius: 6, overflow: 'hidden', cursor: 'crosshair',
        }}
      >
        <img
          ref={imgRef}
          src={point.imageUrl}
          alt=""
          draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain' }}
        />
        {rect && (
          <>
            <div style={{
              position: 'absolute',
              left: markerLeftPx - radiusPx, top: markerTopPx - radiusPx,
              width: radiusPx * 2, height: radiusPx * 2, borderRadius: '50%',
              background: 'rgba(184,134,59,0.25)', border: '2px solid #B8863B',
              pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute',
              left: markerLeftPx - 5, top: markerTopPx - 5,
              width: 10, height: 10, borderRadius: '50%', background: '#A23E2D',
              pointerEvents: 'none',
            }} />
          </>
        )}
      </div>
      <label className="block text-xs text-gray-600">
        {t.acceptableClickRadius || 'Acceptable click radius:'} {point.radiusPercent}%
        <input
          type="range" min={radiusMin} max={radiusMax}
          value={point.radiusPercent} onChange={handleRadiusChange}
          className="block w-full"
        />
      </label>
      <button type="button" className="text-xs text-indigo-600 underline" onClick={() => onChange(null)}>
        {t.replaceImage || 'Replace image'}
      </button>
    </div>
  );
}
