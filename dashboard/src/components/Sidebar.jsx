import { NavLink } from 'react-router-dom';

const links = [
  { to: '/global-memory', label: '🧠 Global Memory' },
  { to: '/project-memory', label: '📁 Project Memory' },
  { to: '/manual-memory', label: '📝 Add Memory Manually' },
  { to: '/brain-view', label: '🧠 Brain View' },
  { to: '/projects', label: '📂 Projects' },
  { to: '/devices', label: '💻 Devices' },
  { to: '/logs', label: '📋 Logs' },
  { to: '/tools', label: '🔧 Tools' },
  { to: '/settings/mcp', label: '⚙️ MCP Settings' },
];

export default function Sidebar() {
  return (
    <aside className="w-80 min-h-full bg-base-300 p-4 flex flex-col text-base-content">
      <h1 className="text-xl font-bold mb-6 px-2">⚡ Swastik MCP</h1>

      <ul className="menu menu-md gap-1 flex-1">
        {links.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                isActive ? 'active font-semibold' : ''
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="text-xs opacity-50 px-2 mt-4">v1.0.0 • Solo Mode</div>
    </aside>
  );
}
