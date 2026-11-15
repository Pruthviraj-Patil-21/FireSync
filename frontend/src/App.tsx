import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { Flame, Menu, X, Orbit, ShieldCheck, BookOpen, Compass, Layers, BarChart2 } from 'lucide-react';
import { Overview } from './pages/Overview/Overview';
import { FireMap } from './pages/FireMap/FireMap';
import { Harmonization } from './pages/Harmonization/Harmonization';
import { Analysis } from './pages/Analysis/Analysis';
import { Methodology } from './pages/Methodology/Methodology';
import { AuthModal } from './components/auth/AuthModal';

const Header: React.FC = () => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const location = useLocation();

  // 4 Primary Navigation Destinations (Stage 5 Architecture)
  const navLinks = [
    { label: 'OVERVIEW', path: '/', icon: Orbit },
    { label: 'FIRE MAP', path: '/map', icon: Compass },
    { label: 'HARMONIZATION', path: '/harmonization', icon: Layers },
    { label: 'ANALYSIS', path: '/analysis', icon: BarChart2 },
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-graphite-950/90 backdrop-blur-md border-b border-slate-800 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link to="/" className="flex items-center space-x-3 group">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-teal-scientific/20 border border-teal-scientific/40 p-0.5">
            <div className="w-full h-full bg-graphite-950 rounded-[6px] flex items-center justify-center">
              <Flame className="w-4 h-4 text-terracotta group-hover:scale-110 transition-transform duration-200" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-teal-light rounded-full animate-ping opacity-75" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="font-mono font-bold tracking-wider text-base text-ivory">
                FIRESYNC
              </span>
              <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-teal-scientific/20 border border-teal-scientific/30 text-teal-light tracking-widest font-semibold">
                NASA 2026
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono tracking-tight">
              MODIS &amp; VIIRS HARMONIZATION
            </p>
          </div>
        </Link>

        {/* 4 Primary Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center space-x-1 font-mono text-xs">
          {navLinks.map((link) => {
            const isActive =
              link.path === '/'
                ? location.pathname === '/' || location.pathname === '/overview' || location.pathname === '/dashboard'
                : location.pathname.startsWith(link.path);

            const Icon = link.icon;

            return (
              <Link
                key={link.path}
                to={link.path}
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'text-ivory bg-slate-800/90 font-bold border-b-2 border-teal-scientific'
                    : 'text-slate-400 hover:text-ivory hover:bg-slate-800/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-teal-light' : 'text-slate-400'}`} />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Right Action Toolbar: Secondary Methodology Link, Live Feed Badge, Auth Gateway */}
        <div className="flex items-center space-x-3 font-mono text-xs">
          {/* Secondary Methodology Link */}
          <Link
            to="/methodology"
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded text-slate-400 hover:text-ivory transition-colors ${
              location.pathname === '/methodology' ? 'text-ivory font-bold bg-slate-800/60' : ''
            }`}
            title="Scientific Principles & Methodology Documentation"
          >
            <BookOpen className="w-3.5 h-3.5 text-ochre-light" />
            <span className="text-[11px]">Methodology</span>
          </Link>

          {/* Live NASA Satellite Feed Telemetry Indicator */}
          <div className="hidden lg:flex items-center space-x-1.5 text-[11px] text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>5,895 OBS ONLINE</span>
          </div>

          {/* Operator Auth Gateway */}
          <button
            onClick={() => setAuthModalOpen(true)}
            className="flex items-center space-x-1.5 px-2.5 py-1 bg-graphite-900 hover:bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-ivory text-[11px] transition-colors cursor-pointer"
            title="Operator Login & Access Control"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-teal-light" />
            <span className="hidden sm:inline">AUTH</span>
          </button>

          {/* Mobile Menu Toggle Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-lg bg-graphite-900 border border-slate-800 text-slate-300 hover:text-white cursor-pointer"
            aria-label="Toggle Navigation Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-graphite-950/98 border-b border-slate-800 px-4 py-3 space-y-1.5 font-mono text-xs backdrop-blur-xl">
          {navLinks.map((link) => {
            const isActive =
              link.path === '/'
                ? location.pathname === '/' || location.pathname === '/overview' || location.pathname === '/dashboard'
                : location.pathname.startsWith(link.path);

            const Icon = link.icon;

            return (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-slate-800 text-ivory font-bold'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 text-teal-light" />
                <span>{link.label}</span>
              </Link>
            );
          })}

          <Link
            to="/methodology"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-white"
          >
            <BookOpen className="w-4 h-4 text-ochre-light" />
            <span>METHODOLOGY</span>
          </Link>
        </div>
      )}
    </header>
  );
};

export default function App() {
  return (
    <Router>
      <div className="min-h-screen bg-space-950 text-slate-100 flex flex-col font-sans selection:bg-teal-scientific/30 selection:text-ivory">
        <Header />
        <main className="flex-1 flex flex-col min-h-0 relative w-full">
          <Routes>
            {/* 1. Overview */}
            <Route path="/" element={<Overview />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />

            {/* 2. Fire Map */}
            <Route path="/map" element={<FireMap />} />
            <Route path="/hotspots" element={<Navigate to="/map" replace />} />
            <Route path="/explorer" element={<Navigate to="/map" replace />} />

            {/* 3. Harmonization */}
            <Route path="/harmonization" element={<Harmonization />} />

            {/* 4. Analysis (Consolidated Historical + Sensor Comparison) */}
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/historical" element={<Navigate to="/analysis?tab=historical" replace />} />
            <Route path="/satellites" element={<Navigate to="/analysis?tab=sensors" replace />} />
            <Route path="/comparison" element={<Navigate to="/analysis?tab=sensors" replace />} />

            {/* Secondary Documentation: Methodology */}
            <Route path="/methodology" element={<Methodology />} />

            {/* Catch-all redirect to Overview */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}
