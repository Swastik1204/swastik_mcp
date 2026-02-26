import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './services/firebase';

import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import GlobalMemoryPage from './pages/GlobalMemoryPage';
import ProjectMemoryPage from './pages/ProjectMemoryPage';
import DevicesPage from './pages/DevicesPage';
import LogsPage from './pages/LogsPage';
import ToolsPage from './pages/ToolsPage';

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
    <BrowserRouter>
      <div className="flex h-screen bg-base-200">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Navbar user={user} onLogout={() => signOut(auth)} />
          <main className="flex-1 overflow-y-auto p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/global-memory" />} />
              <Route path="/global-memory" element={<GlobalMemoryPage />} />
              <Route path="/project-memory" element={<ProjectMemoryPage />} />
              <Route path="/devices" element={<DevicesPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/tools" element={<ToolsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
