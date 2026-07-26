import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Clock, Gamepad2, Play, Search, Users, Wifi, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import EmptyState from '../shared/EmptyState';
import LoadingState from '../shared/LoadingState';

export default function StudentGames() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [liveGames, setLiveGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const loadLiveGames = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await axios.get('/api/live-sessions/student/active');
      setLiveGames(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load online games');
      setLiveGames([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLiveGames();
    const timer = window.setInterval(loadLiveGames, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return liveGames;
    return liveGames.filter(game => {
      const title = (game.title || '').toLowerCase();
      const teacher = (game.teacher?.name || '').toLowerCase();
      const code = (game.code || '').toLowerCase();
      const template = (game.gameCreation?.templateName || '').toLowerCase();
      return title.includes(q) || teacher.includes(q) || code.includes(q) || template.includes(q);
    });
  }, [liveGames, search]);

  const handleJoin = (game, isRejoin = false) => {
    if (!game.code) return;
    if (isRejoin && game.gameCreation?._id) {
      navigate(`/student/play-game/${game.gameCreation._id}`, { state: { live: { roomCode: game.code }, isRejoin: true } });
    } else {
      navigate(`/student/lobby/${String(game.code).toUpperCase()}`, { state: { isRejoin } });
    }
  };

  if (loading) return <LoadingState message={t.loadingGames || 'Loading online games...'} />;

  return (
    <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Wifi className="text-sky-500 w-6 h-6" />
                {t.onlineGames || 'Active Games'}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {t.onlineGamesDescription || 'Join live games opened by your teachers.'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t.searchGames || 'Search by name or code...'}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none w-full md:w-64 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={loadLiveGames}
                className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t.refresh || 'Refresh'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {!error && filteredGames.length === 0 && (
          <div className="p-8">
            <EmptyState
              icon={<Gamepad2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
              title={t.noOnlineGames || 'No active games right now'}
              message={t.noOnlineGamesMessage || 'When your teacher opens a live room for your class, it will appear here.'}
            />
          </div>
        )}

        <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto custom-scrollbar">
          {filteredGames.map(game => {
            const canResume = ['disconnected', 'active'].includes(game.myStatus);
            return (
              <div 
                key={game._id} 
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer hover:bg-sky-50 transition-all group border-l-4 border-transparent hover:border-sky-500"
                onClick={() => handleJoin(game, canResume)}
              >
                <div className="flex items-start sm:items-center gap-4 min-w-0 flex-1 mb-4 sm:mb-0">
                  <div className="w-12 h-12 bg-sky-100 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Gamepad2 className="w-6 h-6 text-sky-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-gray-900 text-base truncate">{game.title}</p>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${game.status === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${game.status === 'running' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        {game.status === 'running' ? (t.running || 'Running') : (t.lobby || 'Lobby')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                      {game.code && (
                        <span className="inline-flex items-center gap-1">
                          Code: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-bold">{game.code}</span>
                        </span>
                      )}
                      {game.teacher?.name && (
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {game.teacher.name}</span>
                      )}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(game.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 sm:ml-4 flex-shrink-0 justify-end">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleJoin(game, canResume); }}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white transition-all shadow-sm ${
                      canResume ? 'bg-orange-500 hover:bg-orange-600' : 'bg-sky-500 hover:bg-sky-600'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {canResume ? (t.rejoinNow || 'Resume') : game.status === 'running' ? (t.joinNow || 'Join') : (t.enterLobby || 'Enter lobby')}
                  </button>
                  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-sky-500 transition-colors transform group-hover:translate-x-1 hidden sm:block" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
