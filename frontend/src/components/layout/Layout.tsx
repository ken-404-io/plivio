import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.tsx';

interface LayoutProps {
  isAdmin?: boolean;
}

export default function Layout({ isAdmin = false }: LayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar isAdmin={isAdmin} />
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
