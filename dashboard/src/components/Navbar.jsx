export default function Navbar({ user, onLogout }) {
  return (
    <div className="navbar bg-base-100 shadow-sm px-6">
      <div className="flex-1">
        <span className="text-sm opacity-70">MCP Dashboard</span>
      </div>
      <div className="flex-none gap-4">
        <span className="text-sm">{user?.email || 'Guest'}</span>
        <button className="btn btn-sm btn-outline btn-error" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}
