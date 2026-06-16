import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Clock, Gamepad2, Play, Search, Users, Wifi } from 'lucide-react';
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

  const handleJoin = (code) => {
    if (!code) return;
    navigate(`/student/lobby/${String(code).toUpperCase()}`);
  };

  if (loading) return <LoadingState message={t.loadingGames || 'Loading online games...'} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wifi className="text-primary w-8 h-8" />
            {t.onlineGames || 'Online Games'}
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
              placeholder={t.searchGames || 'Search games...'}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none w-full md:w-64"
            />
          </div>
          <button
            type="button"
            onClick={loadLiveGames}
            className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t.refresh || 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && filteredGames.length === 0 && (
        <EmptyState
          icon={<Gamepad2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />}
          title={t.noOnlineGames || 'No online games right now'}
          message={t.noOnlineGamesMessage || 'When your teacher opens a live room for your class, it will appear here. You can still join with a code from the overview page.'}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {filteredGames.map(game => (
          <div key={game._id} className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all overflow-hidden">
            <div className="h-36 bg-gradient-to-br from-sky-500 via-indigo-500 to-violet-600 relative p-5 flex flex-col justify-between text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                    <span className={`h-2 w-2 rounded-full ${game.isRoomOnline ? 'bg-emerald-300' : 'bg-amber-300'}`} />
                    {game.status === 'running' ? (t.running || 'Running') : (t.lobby || 'Lobby')}
                  </div>
                  <h3 className="mt-3 font-bold text-lg leading-tight line-clamp-2">{game.title}</h3>
                </div>
                <Gamepad2 className="w-12 h-12 text-white/25 flex-shrink-0" />
              </div>

              <div className="flex items-center justify-between text-xs text-white/85">
                <span className="font-mono tracking-widest">{game.code}</span>
                <span>{game.gameCreation?.templateName || t.liveGame || 'Live game'}</span>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span>{game.participantsCount || 0} {t.players || 'players'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span>{new Date(game.createdAt).toLocaleString()}</span>
                </div>
                {game.teacher?.name && (
                  <div className="text-xs text-gray-500">
                    {t.teacher || 'Teacher'}: <span className="font-medium text-gray-700">{game.teacher.name}</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleJoin(game.code)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-dark transition-colors"
              >
                <Play className="w-4 h-4 fill-current" />
                {game.status === 'running' ? (t.joinNow || 'Join now') : (t.enterLobby || 'Enter lobby')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
