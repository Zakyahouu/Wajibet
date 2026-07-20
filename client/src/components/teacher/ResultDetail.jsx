import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';

const ResultDetail = () => {
  const { t } = useLanguage();
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
              const correct = !!a?.isCorrect; // Updated Tier 0 field
              const enginePath = data?.game?.template?.enginePath;
              const reviewUrl = enginePath ? new URL(
                enginePath.replace(/\/index\.html?$/i, '/').replace(/\/?$/, '/') + 'review.html',
                window.location.origin
              ).toString() : null;

              return (
                <li key={i} className="p-4 flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-semibold text-gray-500">Q{i+1}</span>
                    <div className={correct ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'}>
                      {correct ? 'Correct' : 'Wrong'}
                      {Number.isFinite(a?.timeMs) && (
                        <span className="text-gray-500 ml-2 font-normal">Time: {(a.timeMs/1000).toFixed(1)}s</span>
                      )}
                    </div>
                  </div>
                  
                  {/* Delegated Review Iframe */}
                  {reviewUrl && a?.meta ? (
                    <div className="w-full mt-2 border rounded overflow-hidden" style={{ minHeight: '200px' }}>
                      <iframe 
                        src={reviewUrl}
                        title={`Review Q${i+1}`}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                        onLoad={(e) => {
                          e.target.contentWindow.postMessage({
                            type: 'REVIEW_INIT',
                            payload: a.meta
                          }, '*');
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic mt-2">
                      Detailed review unavailable for this answer format.
                    </div>
                  )}
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
