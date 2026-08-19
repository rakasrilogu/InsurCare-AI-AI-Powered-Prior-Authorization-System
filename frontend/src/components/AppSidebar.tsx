import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FilePlus, List, Activity,
  BarChart3, MessageSquare, LogOut, Brain,
  Building2, Shield, ScrollText,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

// Nav items per role + permission
const NAV: Record<string, { label: string; path: string; icon: any; pulse?: boolean }[]> = {
  hospital_submitter: [
    { label: 'Dashboard',     path: '/dashboard',      icon: LayoutDashboard },
    { label: 'New PA Request',path: '/submit',          icon: FilePlus, pulse: true },
    { label: 'All Requests',  path: '/requests',        icon: List },
    { label: 'Analytics',     path: '/analytics',       icon: BarChart3 },
    { label: 'AI Assistant',  path: '/chat',            icon: MessageSquare },
  ],
  hospital_viewer: [
    { label: 'Dashboard',     path: '/dashboard',      icon: LayoutDashboard },
    { label: 'Patient Results',path: '/requests',       icon: List },
    { label: 'Analytics',     path: '/analytics',       icon: BarChart3 },
    { label: 'AI Assistant',  path: '/chat',            icon: MessageSquare },
  ],
  insurer: [
    { label: 'Dashboard',     path: '/dashboard',      icon: LayoutDashboard },
    { label: 'Claims',        path: '/requests',        icon: List },
    { label: 'Live Panel',    path: '/agent-tracking',  icon: Activity },
    { label: 'Analytics',     path: '/analytics',       icon: BarChart3 },
    { label: 'AI Assistant',  path: '/chat',            icon: MessageSquare },
    { label: 'Audit Log',     path: '/audit',           icon: ScrollText },
  ],
};

const ROLE_META: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  hospital: { label: 'Hospital',        icon: Building2,   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  insurer:  { label: 'Insurance Company', icon: Shield,      color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

const AppSidebar = () => {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, logout, isHospital, canSubmit } = useAuth();

  const role    = user?.role || 'hospital';
  const navKey  = isHospital ? (canSubmit ? 'hospital_submitter' : 'hospital_viewer') : 'insurer';
  const navItems = NAV[navKey] || NAV.hospital_viewer;
  const meta     = ROLE_META[role] || ROLE_META.hospital;
  const RoleIcon = meta.icon;

  const handleLogout = () => { logout(); navigate('/'); };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-[hsl(var(--sidebar-background))] text-sidebar-foreground flex flex-col z-50">

      {/* Logo */}
      <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center relative">
          <Brain className="w-5 h-5 text-secondary-foreground" />
          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-[hsl(var(--sidebar-background))]" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-sidebar-primary-foreground">InsurCare AI</h1>
          <p className="text-xs text-sidebar-foreground/60">6-Agent System</p>
        </div>
      </div>

      {/* Role badge */}
      <div className={`mx-4 mt-4 px-3 py-2.5 rounded-xl ${meta.bg} flex items-center gap-2.5`}>
        <RoleIcon className={`w-4 h-4 ${meta.color} shrink-0`} />
        <div className="min-w-0">
          <p className={`text-xs font-bold ${meta.color}`}>{meta.label}</p>
          <p className="text-[10px] text-sidebar-foreground/50 truncate">{user?.full_name}</p>
          {user?.hospital    && <p className="text-[10px] text-sidebar-foreground/40 truncate">{user.hospital}</p>}
          {user?.company_name && <p className="text-[10px] text-sidebar-foreground/40 truncate">{user.company_name}</p>}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1 mt-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon     = item.icon;
          return (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-sidebar-accent text-sidebar-primary shadow-glow'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              }`}>
              <Icon className="w-5 h-5 shrink-0" />
              {item.label}
              {item.pulse && (
                <span className="ml-auto w-2 h-2 rounded-full bg-success animate-pulse" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <div className="px-4 py-2 text-xs text-sidebar-foreground/40">
          {user?.email}
        </div>
        <button onClick={handleLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-all">
          <LogOut className="w-5 h-5" />
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
