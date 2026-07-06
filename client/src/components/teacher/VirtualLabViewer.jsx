import React, { useState } from 'react';
import { ArrowLeft, Loader2, Maximize2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const VirtualLabViewer = ({ lab, onBack }) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

  const handleFullscreen = () => {
    const iframe = document.getElementById('virtual-lab-iframe');
    if (iframe.requestFullscreen) {
      iframe.requestFullscreen();
    } else if (iframe.webkitRequestFullscreen) {
      iframe.webkitRequestFullscreen();
    } else if (iframe.msRequestFullscreen) {
      iframe.msRequestFullscreen();
    }
  };

  return (
    <div className="bg-surface-light rounded-xl shadow-sm border border-border-light overflow-hidden flex flex-col h-[calc(100vh-140px)]">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-slate-50 shrink-0">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="flex items-center text-text-muted-light hover:text-gray-700 transition-colors bg-white px-3 py-1.5 rounded-lg border border-border-light"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t.back || 'Back to Labs'}
          </button>
          
          <div>
            <h2 className="text-lg font-bold text-text-main-light">{lab.title}</h2>
            <div className="flex items-center space-x-2 text-xs mt-1">
              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {lab.category}
              </span>
              {lab.subcategory && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-text-muted-light">{lab.subcategory}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={handleFullscreen}
          className="p-2 text-text-muted-light hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Fullscreen"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
      </div>

      {/* Viewer Area */}
      <div className="relative flex-1 w-full bg-gray-100">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 z-10">
            <Loader2 className="w-8 h-8 text-primary animate-spin mb-4" />
            <p className="text-text-muted-light font-medium animate-pulse">{t.loading || 'Loading Virtual Lab...'}</p>
          </div>
        )}
        
        <iframe
          id="virtual-lab-iframe"
          src={`/api/virtual-labs/file/${lab.fileName}`}
          className="w-full h-full border-none"
          sandbox="allow-scripts allow-same-origin allow-popups"
          onLoad={() => setLoading(false)}
          title={lab.title}
        />
      </div>
    </div>
  );
};

export default VirtualLabViewer;
