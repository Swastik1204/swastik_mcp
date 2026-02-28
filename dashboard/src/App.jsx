import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, Suspense, lazy } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './services/firebase';

import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import ErrorBoundary from './components/ErrorBoundary';
import PageSkeleton from './components/PageSkeleton';
import LoginPage from './pages/LoginPage';
import GlobalMemoryPage from './pages/GlobalMemoryPage';
import ProjectMemoryPage from './pages/ProjectMemoryPage';
import DevicesPage from './pages/DevicesPage';
import LogsPage from './pages/LogsPage';
import ToolsPage from './pages/ToolsPage';
import ProjectsPage from './pages/ProjectsPage';
import ManualMemoryPage from './pages/ManualMemoryPage';

// ── Heavy pages: lazy-loaded so they don't bloat the initial bundle ──
// vis-network (~500 KB) and MCP wizard are deferred until first visit.
const McpSettingsPage = lazy(() => import('./pages/McpSettingsPage'));
const BrainViewPage   = lazy(() => import('./pages/BrainViewPage'));

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = loading
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  // Loading spinner while Firebase checks auth state
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-base-200">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return (
    // future flags silence React Router v6 → v7 deprecation warnings
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="drawer lg:drawer-open h-screen bg-base-200">
        <input id="main-drawer" type="checkbox" className="drawer-toggle" />
        
        <div className="drawer-content flex flex-col overflow-hidden">
          <Navbar user={user} onLogout={() => signOut(auth)} />
          <main className="flex-1 overflow-y-auto p-6">
            <ErrorBoundary>
              <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route path="/" element={<Navigate to="/global-memory" />} />
                  <Route path="/global-memory" element={<GlobalMemoryPage />} />
                  <Route path="/project-memory" element={<ProjectMemoryPage />} />
                  <Route path="/manual-memory" element={<ManualMemoryPage />} />
                  <Route path="/brain-view" element={<BrainViewPage />} />
                  <Route path="/devices" element={<DevicesPage />} />
                  <Route path="/logs" element={<LogsPage />} />
                  <Route path="/tools" element={<ToolsPage />} />
                  <Route path="/projects" element={<ProjectsPage />} />
                  <Route path="/settings/mcp" element={<McpSettingsPage />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </main>
        </div>

        <div className="drawer-side z-40">
          <label htmlFor="main-drawer" aria-label="close sidebar" className="drawer-overlay"></label>
          <Sidebar />
        </div>
      </div>
    </BrowserRouter>
  );
}
