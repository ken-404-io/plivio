import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';

export default function Layout({ isAdmin = false }) {
  return (
    <div className="app-shell">
      <Sidebar isAdmin={isAdmin} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
