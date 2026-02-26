import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState } from 'react';

import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import GlobalMemoryPage from './pages/GlobalMemoryPage';
import ProjectMemoryPage from './pages/ProjectMemoryPage';
import DevicesPage from './pages/DevicesPage';
import LogsPage from './pages/LogsPage';
import ToolsPage from './pages/ToolsPage';

export default function App() {
  const [user, setUser] = useState(null);

  // Mock login — replace with Firebase Auth later
  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-base-200">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Navbar user={user} onLogout={() => setUser(null)} />

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
