import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';

/**
 * A single answer row with a delegated-review iframe.
 *
 * Security & handshake (Batch 6):
 *  - The iframe runs under sandbox="allow-scripts" ONLY, so it gets an opaque
 *    origin and cannot read the parent's cookies/localStorage/DOM.
 *  - The engine's review.html emits REVIEW_READY when mounted; only then does the
 *    parent post REVIEW_INIT with the FULL Tier 0 interaction object.
 *  - If no REVIEW_READY arrives within 5s (missing/broken engine), the iframe is
 *    unmounted and a styled Tier 0 fallback table is rendered instead.
 */
const ReviewRow = ({ answer, index, reviewUrl }) => {
  const { language, isRTL } = useLanguage();
  const iframeRef = useRef(null);
  // 'pending' -> waiting for REVIEW_READY | 'ready' -> handshake done | 'fallback'
  const [mode, setMode] = useState(reviewUrl ? 'pending' : 'fallback');

  useEffect(() => {
    if (!reviewUrl) return;
    let timeoutId;

    const onMessage = (event) => {
      // Match by source window so we only react to OUR iframe.
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type === 'REVIEW_READY') {
        clearTimeout(timeoutId);
        setMode('ready');
        // Send the full interaction (Tier 0 + meta), not just meta.
        try {
          iframeRef.current.contentWindow.postMessage(
            { type: 'REVIEW_INIT', payload: answer, direction: isRTL ? 'rtl' : 'ltr', locale: language || 'en' },
            '*'
          );
        } catch { /* opaque-origin post is still fine with '*' */ }
      }
    };

    window.addEventListener('message', onMessage);
    timeoutId = setTimeout(() => setMode((m) => (m === 'ready' ? m : 'fallback')), 5000);

    return () => {
      window.removeEventListener('message', onMessage);
      clearTimeout(timeoutId);
    };
  }, [reviewUrl, answer]);

  if (reviewUrl && mode !== 'fallback') {
    return (
      <div className="w-full mt-2 border rounded overflow-hidden" style={{ minHeight: '200px' }}>
        <iframe
          ref={iframeRef}
          src={reviewUrl}
          title={`Review Q${index + 1}`}
          className="w-full h-full border-0"
          sandbox="allow-scripts"
          style={{ minHeight: '200px' }}
        />
      </div>
    );
  }

  // Fallback: raw Tier 0 contract table.
  const a = answer || {};
  const fmt = (v) => (v === undefined || v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border-b border-gray-200">
        Standard review
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-200">
          <tr><td className="px-3 py-2 text-gray-500 w-40">Your answer</td><td className="px-3 py-2">{fmt(a.userAnswer)}</td></tr>
          <tr><td className="px-3 py-2 text-gray-500">Correct answer</td><td className="px-3 py-2">{fmt(a.correctAnswer)}</td></tr>
          <tr><td className="px-3 py-2 text-gray-500">Result</td><td className={`px-3 py-2 font-medium ${a.isCorrect ? 'text-emerald-700' : 'text-red-700'}`}>{a.isCorrect ? 'Correct' : 'Wrong'}</td></tr>
          <tr><td className="px-3 py-2 text-gray-500">Time</td><td className="px-3 py-2">{Number.isFinite(a.timeMs) ? `${(a.timeMs / 1000).toFixed(1)}s` : '—'}</td></tr>
          <tr><td className="px-3 py-2 text-gray-500">Score</td><td className="px-3 py-2">{fmt(a.score)} / {fmt(a.maxScore)}</td></tr>
        </tbody>
      </table>
    </div>
  );
};

const ResultDetail = () => {
  const { t, language, isRTL } = useLanguage();
  const { resultId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await axios.get(`/api/results/detail/${resultId}`);
        if (!mounted) return;
        setData(data);
      } catch (e) {
        if (!mounted) return;
        setError('Failed to load result.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [resultId]);

  if (loading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  const items = data?.items || [];
  const studentName = [data?.result?.student?.firstName, data?.result?.student?.lastName].filter(Boolean).join(' ') || data?.result?.student?.name || 'Student';
  const enginePath = data?.game?.template?.enginePath;
  const reviewUrl = enginePath ? new URL(
    enginePath.replace(/\/index\.html?$/i, '/').replace(/\/?$/, '/') + 'review.html',
    window.location.origin
  ).toString() : null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Result Detail</h1>
          <Link to={-1} className="text-indigo-600 hover:underline">Back</Link>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">{t.student}</div>
          <div>{studentName}</div>
          <div className="text-sm text-gray-500 mt-2">Score</div>
          <div>{data?.result?.score} / {data?.result?.totalPossibleScore}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 font-semibold border-b border-gray-100">Answers</div>
          <ol className="divide-y divide-gray-100">
            {items.map((it, i) => {
              const a = it.answer;
              const correct = !!a?.isCorrect; // Tier 0 field
              return (
                <li key={i} className="p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-500">Q{i + 1}</span>
                    <div className={correct ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                      {correct ? 'Correct' : 'Wrong'}
                      {Number.isFinite(a?.timeMs) && (
                        <span className="text-gray-500 ml-2 font-normal">Time: {(a.timeMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>
                  <ReviewRow answer={a} index={i} reviewUrl={reviewUrl} />
                </li>
              );
            })}
            {items.length === 0 && (
              <li className="p-4 text-gray-500">No data available.</li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default ResultDetail;
