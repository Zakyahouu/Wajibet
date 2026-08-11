// components/teacher/ViewResults.jsx
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import axios from 'axios';
import {
  Trophy,
  Users,
  BarChart3,
  Crown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ArrowLeft,
  Clock,
  Target,
  ChevronDown,
  ChevronUp,
  Filter
} from 'lucide-react';

const ViewResults = () => {
  const { user } = useContext(AuthContext);
  const { gameCreationId } = useParams();
  const location = useLocation();
  const sessionId = new URLSearchParams(location.search).get('sessionId');

  const [results, setResults] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Interactive Heatmap Question Selection
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(null);
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'matrix'
  
  // Slide-out panel state for individual student
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    if (user?.role === 'student') return;
    let mounted = true;
    (async () => {
      try {
        const res = await axios.get('/api/classes/teacher');
        if (!mounted) return;
        setClasses(res.data || []);
      } catch (_) {}
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const params = {};
        if (classId) params.classId = classId;
        if (sessionId) params.sessionId = sessionId;

        const resResults = await axios.get(`/api/results/${gameCreationId}`, { params });
        setResults(resResults.data);

        const resStats = await axios.get(`/api/results/${gameCreationId}/stats/global`, { params });
        setGlobalStats(resStats.data);
      } catch (err) {
        setError('Failed to load game analytics.');
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [gameCreationId, classId, sessionId]);

  const getDashboardPath = () => {
    switch (user?.role) {
      case 'admin': return '/admin/dashboard';
      case 'teacher': return '/teacher/dashboard';
      case 'student': return '/student/dashboard';
      default: return '/';
    }
  };

  const getStudentName = (student) => {
    if (!student) return 'Unknown student';
    return student.name || [student.firstName, student.lastName].filter(Boolean).join(' ') || 'Unknown student';
  };

  // Process data for UI
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const timeA = a.totalTimeMs || 0;
      const timeB = b.totalTimeMs || 0;
      return timeA - timeB;
    });
  }, [results]);

  const top3 = sortedResults.slice(0, 3);
  const others = sortedResults.slice(3);

  // Maximum number of items across any student answer
  const maxQuestionCount = useMemo(() => {
    let max = globalStats?.perItemStats?.length || 0;
    results.forEach(r => {
      if (Array.isArray(r.answers) && r.answers.length > max) {
        max = r.answers.length;
      }
    });
    return max;
  }, [globalStats, results]);

  // Compute detailed per-question student lists for the selected question
  const questionDetails = useMemo(() => {
    if (activeQuestionIndex === null) return null;
    
    const correct = [];
    const wrong = [];
    const skipped = [];

    sortedResults.forEach(r => {
      const studentName = getStudentName(r.student);
      const ans = (r.answers || []).find(a => a.itemIndex === activeQuestionIndex);
      if (!ans) {
        skipped.push({ studentName, timeMs: 0, score: 0, result: r });
      } else if (ans.skipped) {
        skipped.push({ studentName, timeMs: ans.timeMs, score: ans.score, result: r });
      } else if (ans.isCorrect) {
        correct.push({ studentName, timeMs: ans.timeMs, score: ans.score, result: r });
      } else {
        wrong.push({ studentName, timeMs: ans.timeMs, score: ans.score, result: r });
      }
    });

    return { correct, wrong, skipped };
  }, [activeQuestionIndex, sortedResults]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-teal-600 text-base font-semibold">
          <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading Analytics Dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="bg-white border border-red-200 rounded-2xl p-8 max-w-md text-center shadow-sm">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-900 mb-1">Error Loading Data</h3>
          <p className="text-slate-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header & Filters */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
          <div>
            <Link to={getDashboardPath()} className="text-teal-600 hover:text-teal-700 font-semibold text-sm mb-2 inline-flex items-center gap-1.5 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Full Game Statistics</h1>
            {sessionId && <p className="text-teal-600 text-sm mt-1 font-medium flex items-center gap-1.5"><Target className="w-4 h-4" /> Live Session ID: {sessionId}</p>}
          </div>

          {user?.role !== 'student' && (
            <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
              <Filter className="w-4 h-4 text-slate-400 ml-2" />
              <span className="text-slate-500 text-sm font-medium">Class:</span>
              <select 
                value={classId} 
                onChange={(e) => setClassId(e.target.value)} 
                className="px-4 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">All classes</option>
                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
          )}
        </header>

        {results.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
            <BarChart3 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg text-slate-700 font-semibold">No results recorded yet</h3>
            <p className="text-slate-500 text-sm mt-1">Waiting for students to submit their sessions.</p>
          </div>
        ) : (
          <>
            {/* Top Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wider font-bold block mb-0.5">Participants</span>
                  <span className="text-2xl font-black text-slate-900">{globalStats?.totalParticipants || results.length}</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 flex-shrink-0">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wider font-bold block mb-0.5">Avg Score</span>
                  <span className="text-2xl font-black text-teal-600">{globalStats?.avgScore || 0}%</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center text-cyan-600 flex-shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wider font-bold block mb-0.5">Completion</span>
                  <span className="text-2xl font-black text-cyan-600">{globalStats?.completionRate || 0}%</span>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 flex-shrink-0">
                  <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-slate-400 text-xs uppercase tracking-wider font-bold block mb-0.5">Stumbling Block</span>
                  <span className="text-xl font-black text-amber-600 block">
                    {globalStats?.stumblingBlock ? `Q${globalStats.stumblingBlock.itemIndex + 1}` : 'N/A'}
                  </span>
                  {globalStats?.stumblingBlock && (
                    <span className="text-xs text-amber-600 font-medium">{globalStats.stumblingBlock.wrongRate}% failed</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Left Column: Podium & Leaderboard */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* The Podium */}
                {user?.role !== 'student' && top3.length > 0 && (
                  <div className="bg-gradient-to-b from-teal-50 to-white rounded-3xl p-8 border border-teal-100 shadow-sm relative overflow-hidden">
                    <h2 className="text-xl font-bold text-slate-900 mb-8 text-center flex items-center justify-center gap-2">
                      <Trophy className="w-6 h-6 text-amber-500" />
                      Top Performers
                    </h2>
                    
                    <div className="flex items-end justify-center gap-2 sm:gap-6 h-48 relative z-10">
                      {/* 2nd Place */}
                      {top3[1] && (
                        <div className="flex flex-col items-center animate-[slideUp_0.5s_ease-out]">
                          <span className="text-slate-700 font-bold mb-2 truncate max-w-[100px] text-center text-xs">{getStudentName(top3[1].student)}</span>
                          <div className="w-20 sm:w-24 h-24 bg-slate-200 rounded-t-2xl border-t-4 border-slate-400 flex flex-col items-center justify-center relative shadow-sm">
                            <span className="text-3xl font-black text-slate-600">2</span>
                            <span className="text-xs text-slate-600 font-bold mt-1">{top3[1].score} pts</span>
                          </div>
                        </div>
                      )}
                      
                      {/* 1st Place */}
                      {top3[0] && (
                        <div className="flex flex-col items-center animate-[slideUp_0.7s_ease-out] z-10 -mx-2">
                          <span className="text-slate-900 font-extrabold mb-2 text-sm truncate max-w-[120px] text-center">{getStudentName(top3[0].student)}</span>
                          <div className="w-24 sm:w-28 h-32 bg-amber-100 rounded-t-2xl border-t-4 border-amber-500 flex flex-col items-center justify-center relative shadow-md hover:scale-105 transition-transform cursor-pointer" onClick={() => setSelectedStudent(top3[0])}>
                            <div className="absolute -top-6">
                              <Crown className="w-7 h-7 text-amber-500 fill-amber-400" />
                            </div>
                            <span className="text-4xl font-black text-amber-600">1</span>
                            <span className="text-xs text-amber-800 font-bold mt-1">{top3[0].score} pts</span>
                          </div>
                        </div>
                      )}

                      {/* 3rd Place */}
                      {top3[2] && (
                        <div className="flex flex-col items-center animate-[slideUp_0.3s_ease-out]">
                          <span className="text-slate-600 font-bold mb-2 truncate max-w-[100px] text-center text-xs">{getStudentName(top3[2].student)}</span>
                          <div className="w-20 sm:w-24 h-20 bg-amber-50 rounded-t-2xl border-t-4 border-amber-700 flex flex-col items-center justify-center relative shadow-sm">
                            <span className="text-3xl font-black text-amber-800">3</span>
                            <span className="text-xs text-amber-800 font-bold mt-1">{top3[2].score} pts</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Switch View Controls */}
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900">Student Results</h2>
                  <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm text-xs font-semibold">
                    <button 
                      onClick={() => setViewMode('summary')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${viewMode === 'summary' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Summary Table
                    </button>
                    <button 
                      onClick={() => setViewMode('matrix')}
                      className={`px-3 py-1.5 rounded-lg transition-colors ${viewMode === 'matrix' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Question Matrix
                    </button>
                  </div>
                </div>

                {/* View Mode 1: Summary Table */}
                {viewMode === 'summary' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold text-[10px]">
                          <tr>
                            <th className="p-4">Rank</th>
                            <th className="p-4">Student Name</th>
                            <th className="p-4">Score</th>
                            <th className="p-4">Time</th>
                            <th className="p-4">Submitted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedResults.map((result, idx) => (
                            <tr 
                              key={result._id} 
                              onClick={() => setSelectedStudent(result)}
                              className="hover:bg-slate-50 transition-colors cursor-pointer group"
                            >
                              <td className="p-4 text-slate-400 font-bold">#{idx + 1}</td>
                              <td className="p-4 text-slate-800 font-semibold group-hover:text-teal-600 transition-colors">
                                {getStudentName(result.student)}
                              </td>
                              <td className="p-4">
                                <span className="text-teal-600 font-bold">{result.score}</span>
                                <span className="text-slate-400 ml-1">/ {result.totalPossibleScore}</span>
                              </td>
                              <td className="p-4 text-slate-500">
                                {result.totalTimeMs ? `${(result.totalTimeMs / 1000).toFixed(1)}s` : '-'}
                              </td>
                              <td className="p-4 text-slate-400 text-xs">
                                {new Date(result.createdAt).toLocaleTimeString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* View Mode 2: Question-by-Student Matrix */}
                {viewMode === 'matrix' && (
                  <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden p-6">
                    <div className="mb-4">
                      <h3 className="text-base font-bold text-slate-900">Per-Question Student Matrix</h3>
                      <p className="text-xs text-slate-500">See exact status for each student on every question.</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="p-3 font-bold text-slate-600 border-r border-slate-200 sticky left-0 bg-slate-50 min-w-[140px]">Student</th>
                            {Array.from({ length: maxQuestionCount }).map((_, qIdx) => (
                              <th key={qIdx} className="p-3 font-bold text-slate-600 text-center min-w-[50px]">
                                Q{qIdx + 1}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedResults.map((result) => (
                            <tr key={result._id} className="hover:bg-slate-50 transition-colors">
                              <td className="p-3 font-semibold text-slate-800 border-r border-slate-200 sticky left-0 bg-white truncate max-w-[140px]" title={getStudentName(result.student)}>
                                {getStudentName(result.student)}
                              </td>
                              {Array.from({ length: maxQuestionCount }).map((_, qIdx) => {
                                const ans = (result.answers || []).find(a => a.itemIndex === qIdx);
                                if (!ans || ans.skipped) {
                                  return (
                                    <td key={qIdx} className="p-3 text-center">
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400" title="Skipped">
                                        <MinusCircle className="w-4 h-4" />
                                      </span>
                                    </td>
                                  );
                                }
                                if (ans.isCorrect) {
                                  return (
                                    <td key={qIdx} className="p-3 text-center">
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600" title={`Correct (${(ans.timeMs/1000).toFixed(1)}s)`}>
                                        <CheckCircle2 className="w-4 h-4" />
                                      </span>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={qIdx} className="p-3 text-center">
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600" title={`Wrong (${(ans.timeMs/1000).toFixed(1)}s)`}>
                                      <XCircle className="w-4 h-4" />
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Interactive Question Heatmap & Student Breakdown */}
              <div className="space-y-8">
                <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm space-y-6">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Question Heatmap</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Click any question bar below to see full student breakdown.</p>
                  </div>

                  {globalStats?.perItemStats?.length > 0 ? (
                    <div className="space-y-3">
                      {globalStats.perItemStats.map((item, i) => {
                        let barColor = "bg-emerald-500";
                        if (item.correctRate < 40) barColor = "bg-red-500";
                        else if (item.correctRate < 70) barColor = "bg-amber-500";
                        
                        const isSelected = activeQuestionIndex === item.itemIndex;

                        return (
                          <div 
                            key={item.itemId || i} 
                            onClick={() => setActiveQuestionIndex(isSelected ? null : item.itemIndex)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                              isSelected ? 'bg-teal-50/60 border-teal-300 ring-2 ring-teal-500/20' : 'bg-slate-50/50 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex justify-between items-center text-xs mb-2">
                              <span className="text-slate-800 font-bold flex items-center gap-1.5">
                                Question {item.itemIndex + 1}
                                {isSelected && <span className="text-[10px] bg-teal-600 text-white font-bold px-1.5 py-0.5 rounded-full">Selected</span>}
                              </span>
                              <span className="text-slate-600 font-semibold">{item.correctRate}% success</span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden flex">
                              <div className={`${barColor} h-full transition-all duration-1000 ease-out`} style={{ width: `${item.correctRate}%` }}></div>
                              <div className="bg-red-400 h-full transition-all duration-1000 ease-out" style={{ width: `${item.wrongRate}%` }}></div>
                              <div className="bg-slate-400 h-full transition-all duration-1000 ease-out" style={{ width: `${item.skippedRate}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                      
                      <div className="flex items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-[10px] uppercase tracking-wider font-bold text-slate-400 justify-center">
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Correct</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-400"></div>Wrong</div>
                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-slate-400"></div>Skipped</div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-400 text-sm text-center py-8">Heatmap data processing...</p>
                  )}
                </div>

                {/* Selected Question Student Breakdown Panel */}
                {activeQuestionIndex !== null && questionDetails && (
                  <div className="bg-white rounded-3xl p-6 border border-teal-200 shadow-md space-y-4 animate-[slideUp_0.3s_ease-out]">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="text-base font-extrabold text-slate-900">
                        Q{activeQuestionIndex + 1} Student Breakdown
                      </h3>
                      <button onClick={() => setActiveQuestionIndex(null)} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
                    </div>

                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                      {/* Correct Students */}
                      <div>
                        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Correct ({questionDetails.correct.length})
                        </span>
                        <div className="space-y-1">
                          {questionDetails.correct.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs p-2 bg-emerald-50/50 rounded-xl border border-emerald-100">
                              <span className="font-semibold text-slate-800">{item.studentName}</span>
                              <span className="text-slate-500">{item.timeMs ? `${(item.timeMs/1000).toFixed(1)}s` : '-'}</span>
                            </div>
                          ))}
                          {questionDetails.correct.length === 0 && <span className="text-xs text-slate-400 italic">None</span>}
                        </div>
                      </div>

                      {/* Wrong Students */}
                      <div>
                        <span className="text-xs font-bold text-red-700 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <XCircle className="w-4 h-4 text-red-600" /> Wrong ({questionDetails.wrong.length})
                        </span>
                        <div className="space-y-1">
                          {questionDetails.wrong.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs p-2 bg-red-50/50 rounded-xl border border-red-100">
                              <span className="font-semibold text-slate-800">{item.studentName}</span>
                              <span className="text-slate-500">{item.timeMs ? `${(item.timeMs/1000).toFixed(1)}s` : '-'}</span>
                            </div>
                          ))}
                          {questionDetails.wrong.length === 0 && <span className="text-xs text-slate-400 italic">None</span>}
                        </div>
                      </div>

                      {/* Skipped Students */}
                      <div>
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                          <MinusCircle className="w-4 h-4 text-slate-400" /> Skipped ({questionDetails.skipped.length})
                        </span>
                        <div className="space-y-1">
                          {questionDetails.skipped.map((item, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs p-2 bg-slate-50 rounded-xl border border-slate-100">
                              <span className="font-semibold text-slate-700">{item.studentName}</span>
                              <span className="text-slate-400">Skipped</span>
                            </div>
                          ))}
                          {questionDetails.skipped.length === 0 && <span className="text-xs text-slate-400 italic">None</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </>
        )}
      </div>

      {/* Slide-out Panel for Individual Drill-down */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={() => setSelectedStudent(null)}></div>
          <div className="relative w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl animate-[slideInRight_0.3s_ease-out] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{getStudentName(selectedStudent.student)}</h2>
                <p className="text-teal-600 font-semibold text-sm">Final Score: {selectedStudent.score}</p>
              </div>
              <button onClick={() => setSelectedStudent(null)} className="text-slate-400 hover:text-slate-600 p-2 bg-white rounded-full border border-slate-200 shadow-sm transition-colors">
                ✕
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              
              <div className="flex justify-between items-center bg-slate-50 rounded-2xl p-4 border border-slate-200">
                <div className="text-center">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold">Accuracy</span>
                  <span className="text-xl font-black text-slate-900">
                    {selectedStudent.totalPossibleScore ? Math.round((selectedStudent.score / selectedStudent.totalPossibleScore) * 100) : 0}%
                  </span>
                </div>
                <div className="text-center">
                  <span className="block text-[10px] text-slate-400 uppercase font-bold">Total Time</span>
                  <span className="text-xl font-black text-slate-900">
                    {selectedStudent.totalTimeMs ? `${(selectedStudent.totalTimeMs / 1000).toFixed(1)}s` : 'N/A'}
                  </span>
                </div>
              </div>

              {(() => {
                const categoryGroups = {};
                (selectedStudent.answers || []).forEach((ans) => {
                  const pm = typeof ans.meta === 'string'
                    ? (() => { try { return JSON.parse(ans.meta); } catch { return {}; } })()
                    : (ans.meta || {});
                  const cat = pm.category;
                  if (!cat) return;
                  if (!categoryGroups[cat]) categoryGroups[cat] = { correct: 0, total: 0 };
                  categoryGroups[cat].total++;
                  if (ans.isCorrect) categoryGroups[cat].correct++;
                });
                const categories = Object.keys(categoryGroups);
                if (categories.length === 0) return null;
                return (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                    <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">Breakdown by Type</h3>
                    <div className="space-y-1.5">
                      {categories.map((cat) => {
                        const g = categoryGroups[cat];
                        const pct = Math.round((g.correct / g.total) * 100);
                        return (
                          <div key={cat} className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-slate-700">{cat}</span>
                            <span className="text-slate-500">{g.correct}/{g.total} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              <div>
                <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Detailed Answers</h3>
                {selectedStudent.answers && selectedStudent.answers.length > 0 ? (
                  <div className="space-y-3">
                    {selectedStudent.answers.map((ans, idx) => {
                      const parsedMeta = typeof ans.meta === 'string'
                        ? (() => { try { return JSON.parse(ans.meta); } catch { return {}; } })()
                        : (ans.meta || {});
                      const questionText = parsedMeta.question || parsedMeta.itemText || parsedMeta.prompt || parsedMeta.targetWord || parsedMeta.timelineTitle || null;
                      const options = Array.isArray(parsedMeta.options) ? parsedMeta.options
                        : Array.isArray(parsedMeta.allCategories) ? parsedMeta.allCategories
                        : null;
                      return (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 hover:border-teal-300 transition-colors">
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-slate-800 text-sm">Question {ans.itemIndex + 1}</span>
                          {ans.skipped ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-600 uppercase">Skipped</span>
                          ) : ans.isCorrect ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">Correct</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase">Wrong</span>
                          )}
                        </div>
                        {questionText && (
                          <div className="text-sm text-slate-700 mb-2 font-medium">{String(questionText)}</div>
                        )}
                        {options && (
                          <div className="text-xs text-slate-500 mb-2">Options shown: {options.map(o => (typeof o === 'string' ? o : o.label)).join(', ')}</div>
                        )}
                        <div className="text-xs text-slate-600 flex flex-col gap-0.5 mb-2">
                          <span>Student's answer: <span className="font-semibold">{String(ans.userAnswer ?? '—')}</span></span>
                          {!ans.isCorrect && !ans.skipped && (
                            <span>Correct answer: <span className="font-semibold text-emerald-700">{String(ans.correctAnswer ?? '—')}</span></span>
                          )}
                        </div>
                        {Array.isArray(parsedMeta.attemptHistory) && parsedMeta.attemptHistory.length > 1 && (
                          <div className="text-xs text-slate-500 mt-1">
                            All attempts: {parsedMeta.attemptHistory.map((a, i) => (
                              <span key={i} className={a.isCorrect ? 'text-emerald-600 font-semibold' : 'text-red-500'}>
                                {a.value}{i < parsedMeta.attemptHistory.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 flex justify-between">
                          <span>Time: {ans.timeMs ? `${(ans.timeMs / 1000).toFixed(1)}s` : 'N/A'}</span>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4 italic">No detailed answers available.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

export default ViewResults;
