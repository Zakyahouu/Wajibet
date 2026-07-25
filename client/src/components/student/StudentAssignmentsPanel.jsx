import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { 
  Play, 
  Target, 
  Trophy, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  Activity,
  History,
  Star,
  Zap,
  Info
} from 'lucide-react';
import LoadingState from '../shared/LoadingState';
import EmptyState from '../shared/EmptyState';

export default function StudentAssignmentsPanel() {
  const { t } = useLanguage();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'past'
  const [refreshToken, setRefreshToken] = useState(0);
  
  // Breakdown Modal state
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [breakdownData, setBreakdownData] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [breakdownError, setBreakdownError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Fetch all with no specific status filter to allow frontend grouping
      const assignRes = await axios.get('/api/assignments/my-assignments/detailed', { params: { page: 1, limit: 100 } });
      setItems(assignRes.data.items || []);
    } catch (e) {
      setError('Failed to load missions');
    } finally {
      setLoading(false);
    }
  }, [refreshToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Event-driven refresh
  useEffect(() => {
    const handler = () => setRefreshToken(t => t + 1);
    window.addEventListener('assignmentProgressRefresh', handler);
    window.addEventListener('assignmentResultSaved', handler);
    return () => {
      window.removeEventListener('assignmentProgressRefresh', handler);
      window.removeEventListener('assignmentResultSaved', handler);
    };
  }, []);

  const openBreakdown = async (assignment) => {
    setSelectedAssignment(assignment);
    setLoadingBreakdown(true); setBreakdownError(null); setBreakdownData(null);
    try {
      const res = await axios.get(`/api/assignments/${assignment._id}/breakdown`);
      setBreakdownData(res.data);
    } catch (e) {
      setBreakdownError('Failed to load mission breakdown');
    } finally {
      setLoadingBreakdown(false);
    }
  };

  // Group items
  const activeMissions = useMemo(() => {
    return items.filter(a => a.status === 'active' || a.status === 'dueSoon' || a.status === 'upcoming');
  }, [items]);

  const pastMissions = useMemo(() => {
    return items.filter(a => a.status === 'completed' || a.status === 'expired' || a.status === 'canceled');
  }, [items]);

  const displayItems = activeTab === 'active' ? activeMissions : pastMissions;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-indigo-400 font-bold animate-pulse text-lg flex items-center gap-2">
          <Activity className="w-5 h-5 animate-spin" /> Accessing Mission Logs...
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500 font-bold p-8 text-center">{error}</div>;
  }

  return (
    <div className="space-y-6 relative font-sans">
      
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-indigo-900 tracking-tight">Mission Control</h2>
          <p className="text-gray-500 text-sm mt-1">Track your progress and launch new assignments.</p>
        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto self-start">
          <button 
            onClick={() => setActiveTab('active')}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'active' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
          >
            <Zap className="w-4 h-4" /> Active Missions
          </button>
          <button 
            onClick={() => setActiveTab('past')}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${activeTab === 'past' ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
          >
            <History className="w-4 h-4" /> Past Results
          </button>
        </div>
      </div>

      {/* List */}
      {displayItems.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-3xl p-12 text-center flex flex-col items-center">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
            <Target className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-xl font-bold text-gray-700 mb-2">No {activeTab} missions found</h3>
          <p className="text-gray-500 max-w-md">You are all caught up! Check back later when your teachers assign new missions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {displayItems.map((a) => {
            const { progress } = a;
            const canPlay = a.status === 'active' && a.nextGameAttemptsRemaining > 0 && !!a.nextGameId;
            const allAttempted = progress.totalGames > 0 && progress.completed >= progress.totalGames;
            const progressPct = progress.completionPercent || 0;
            const avgScore = progress.averagePercent || 0;
            
            return (
              <div key={a._id} className={`group relative bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col ${a.status !== 'active' ? 'opacity-80' : ''}`}>
                
                {/* Status Indicator */}
                <div className="absolute top-0 right-0 p-6 flex gap-2">
                  {a.dueSoon && a.status === 'active' && (
                    <span className="flex items-center gap-1 px-3 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold animate-pulse">
                      <Clock className="w-3 h-3" /> Due Soon
                    </span>
                  )}
                  {a.status === 'completed' && (
                    <span className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Completed
                    </span>
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <Target className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div className="pr-24">
                      <h4 className="font-black text-gray-900 text-xl leading-tight line-clamp-1">{a.title}</h4>
                      <p className="text-gray-500 text-sm mt-0.5 line-clamp-1 italic">{a.description || 'No description provided'}</p>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex justify-between items-end mb-2">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Mission Progress</span>
                      <span className="text-sm font-black text-indigo-600">{progressPct}%</span>
                    </div>
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${progressPct}%` }}></div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mt-6 p-4 bg-gray-50 rounded-2xl">
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">Score</span>
                        <div className="flex items-center gap-1">
                          <Star className={`w-4 h-4 ${avgScore > 75 ? 'text-amber-400 fill-current' : 'text-gray-300'}`} />
                          <span className="font-black text-gray-800">{avgScore}%</span>
                        </div>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">Attempts</span>
                        <span className="font-black text-gray-800">{a.attemptLimit || '∞'} Max</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-gray-500 uppercase font-bold mb-1">Due Date</span>
                        <span className="font-black text-gray-800 text-xs mt-0.5">{new Date(a.endDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex gap-3 pt-6 border-t border-gray-100">
                  {canPlay && (
                    <Link 
                      to={`/student/play-game/${a.nextGameId || ''}`} 
                      state={{ assignmentId: a._id }}
                      className="flex-1 bg-indigo-600 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-200"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      {a.nextGameAttempted ? 'Retry Mission' : (progress.completed > 0 ? 'Resume Mission' : 'Start Mission')}
                    </Link>
                  )}
                  {activeTab === 'past' && allAttempted && (
                    <button 
                      onClick={() => openBreakdown(a)}
                      className="flex-1 bg-white border-2 border-indigo-100 text-indigo-700 font-bold py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors"
                    >
                      <History className="w-4 h-4" />
                      Review Answers
                    </button>
                  )}
                  {activeTab === 'active' && !canPlay && !allAttempted && (
                    <div className="flex-1 bg-gray-100 text-gray-400 font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                      Locked
                    </div>
                  )}
                  <button 
                    onClick={() => openBreakdown(a)}
                    className="p-3 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors border border-gray-100"
                    title="Mission Details"
                  >
                    <Info className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Breakdown Modal */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" onClick={() => setSelectedAssignment(null)}></div>
          <div className="relative w-full max-w-2xl max-h-full bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.3s_ease-out]">
            
            <div className="p-6 sm:p-8 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-white flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-indigo-950">{selectedAssignment.title}</h3>
                <p className="text-gray-500 font-medium text-sm mt-1">Detailed Mission Analysis</p>
              </div>
              <button onClick={() => setSelectedAssignment(null)} className="p-2 bg-white rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shadow-sm border border-gray-100">
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-gray-50">
              {loadingBreakdown ? (
                <div className="py-12 text-center text-gray-500 font-medium flex flex-col items-center gap-3">
                  <Activity className="w-6 h-6 animate-spin text-indigo-400" />
                  Decrypting mission logs...
                </div>
              ) : breakdownError ? (
                <div className="py-12 text-center text-red-500 font-bold">{breakdownError}</div>
              ) : breakdownData && breakdownData.games ? (
                <div className="space-y-8">
                  {breakdownData.games.map((g, i) => (
                    <div key={g.gameId || i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                      <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                        <h4 className="font-bold text-gray-800 flex items-center gap-2">
                          <Target className="w-4 h-4 text-indigo-500" /> {g.name}
                        </h4>
                        <span className="text-xs font-bold px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                          Best: {g.bestPercent}%
                        </span>
                      </div>
                      
                      <div className="p-5">
                        {g.attempts && g.attempts.length > 0 ? (
                          <div className="space-y-6">
                            {g.attempts.map((att, j) => (
                              <div key={j} className="space-y-3">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm font-bold text-gray-600 uppercase">Attempt {att.attemptNumber}</span>
                                  <span className={`text-sm font-black ${att.percent >= 70 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                    {att.percent}% ({att.score}/{att.totalPossibleScore})
                                  </span>
                                </div>
                                
                                {att.answers && att.answers.length > 0 ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {att.answers.map((ans, k) => (
                                      <div key={k} className={`p-3 rounded-xl border flex justify-between items-center ${ans.skipped ? 'bg-gray-50 border-gray-200' : ans.isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
                                        <div className="flex items-center gap-2">
                                          <span className="w-6 h-6 rounded-full bg-white shadow-sm flex items-center justify-center text-xs font-black text-gray-500">
                                            {ans.itemIndex + 1}
                                          </span>
                                          <span className="text-xs font-bold text-gray-600">
                                            {ans.timeMs ? `${(ans.timeMs / 1000).toFixed(1)}s` : '-'}
                                          </span>
                                        </div>
                                        <div>
                                          {ans.skipped ? (
                                            <span className="text-[10px] font-black uppercase text-gray-400 bg-white px-2 py-1 rounded shadow-sm">Skipped</span>
                                          ) : ans.isCorrect ? (
                                            <span className="text-[10px] font-black uppercase text-emerald-600 bg-white px-2 py-1 rounded shadow-sm">Correct</span>
                                          ) : (
                                            <span className="text-[10px] font-black uppercase text-rose-600 bg-white px-2 py-1 rounded shadow-sm">Wrong</span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400 italic">Detailed answers not available for this attempt.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 py-4 text-center">No attempts logged yet.</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-gray-500">No data available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
