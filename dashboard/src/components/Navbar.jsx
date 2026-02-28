import { useEffect, useState, useRef } from 'react';
import { mcpHealthCheck, telegramHealthCheck } from '../services/api';

// Backoff intervals (ms): retry quickly at first, then slow down if backend is offline.
// This avoids spamming ERR_CONNECTION_REFUSED in the console every 15 s.
const POLL_ONLINE  = 15_000;   // poll every 15 s when backend is reachable
const POLL_BACKOFF = [5_000, 10_000, 20_000, 40_000, 60_000]; // progressive backoff

export default function Navbar({ user, onLogout }) {
  const [brain, setBrain]         = useState(null);
  const [telegram, setTelegram]   = useState(null);
  const [offline, setOffline]     = useState(false);
  const failCountRef              = useRef(0);
  const timerRef                  = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [mcp, tg] = await Promise.allSettled([mcpHealthCheck(), telegramHealthCheck()]);
        if (!mounted) return;

        if (mcp.status === 'fulfilled') {
          setBrain(mcp.value);
        } else {
          throw mcp.reason || new Error('MCP health fetch failed');
        }

        if (tg.status === 'fulfilled') {
          setTelegram(tg.value);
        } else {
          setTelegram(null);
        }

        setOffline(false);
        failCountRef.current = 0;
        // Backend reachable — poll at normal cadence
        timerRef.current = setTimeout(load, POLL_ONLINE);
      } catch {
        if (!mounted) return;
        setBrain(null);
        setTelegram(null);
        failCountRef.current += 1;
        const failures = failCountRef.current;
        // After 2+ failures, mark offline and back off
        if (failures >= 2) setOffline(true);
        const delay = POLL_BACKOFF[Math.min(failures - 1, POLL_BACKOFF.length - 1)];
        timerRef.current = setTimeout(load, delay);
      }
    }

    load();
    return () => {
      mounted = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="navbar bg-base-100 shadow-sm px-4 lg:px-6">
      <div className="flex-none lg:hidden">
        <label htmlFor="main-drawer" aria-label="open sidebar" className="btn btn-square btn-ghost">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-6 h-6 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
        </label>
      </div>
      <div className="flex-1">
        <span className="text-sm opacity-70 ml-2 lg:ml-0">MCP Dashboard</span>
      </div>
      <div className="flex-none gap-4">
        <div className="hidden md:flex items-center gap-2 text-xs">
          {offline ? (
            <span className="badge badge-sm badge-error gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse inline-block" />
              Backend offline
            </span>
          ) : (
            <>
              <span className={`badge badge-sm ${brain?.firestore ? 'badge-success' : 'badge-warning'}`}>
                Firestore {brain?.firestore ? 'ok' : 'down'}
              </span>
              <span className={`badge badge-sm ${telegram?.bot_connected ? 'badge-success' : 'badge-warning'}`}>
                Telegram {telegram?.bot_connected ? 'ok' : 'idle'}
              </span>
              <span className="badge badge-sm badge-outline">Queue {brain?.queueDepth ?? '-'}</span>
              <span className={`badge badge-sm ${Number(brain?.deadLetters || 0) > 0 ? 'badge-error' : 'badge-success'}`}>
                Dead {brain?.deadLetters ?? '-'}
              </span>
            </>
          )}
        </div>
        <label className="swap swap-rotate">
          <input type="checkbox" className="theme-controller" value="light" />
          {/* sun icon */}
          <svg className="swap-off fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/></svg>
          {/* moon icon */}
          <svg className="swap-on fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/></svg>
        </label>
        <span className="text-sm hidden sm:inline-block">{user?.email || 'Guest'}</span>
        <button className="btn btn-sm btn-outline btn-error" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
