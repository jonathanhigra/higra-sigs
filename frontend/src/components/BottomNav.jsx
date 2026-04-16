import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import Icon from './Icon';
import api from '../lib/api';
import './BottomNav.css';

const items = [
  { to: '/feed', label: 'Início', icon: <path d="M3 10.5L12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5z" /> },
  { to: '/explore', label: 'Explorar', icon: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></> },
  { to: '/notifications', label: 'Alertas', icon: <><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>, badgeKey: 'notifs' },
  { to: '/messages', label: 'DMs', icon: <><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></>, badgeKey: 'dms' },
  { to: '/profile', label: 'Perfil', icon: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></> },
];

const BottomNav = () => {
  const location = useLocation();
  const [badges, setBadges] = useState({ notifs: 0, dms: 0 });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const fetchBadges = () => {
      api.get('/social/notifications/unread-count').then(({ data }) => {
        setBadges((prev) => ({ ...prev, notifs: data.count || 0 }));
      }).catch(() => {});
      api.get('/social/dm/unread-count').then(({ data }) => {
        setBadges((prev) => ({ ...prev, dms: data.count || 0 }));
      }).catch(() => {});
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (location.pathname === '/notifications') {
      setBadges((prev) => ({ ...prev, notifs: 0 }));
    }
    if (location.pathname.startsWith('/messages')) {
      setBadges((prev) => ({ ...prev, dms: 0 }));
    }
  }, [location.pathname]);

  return (
    <nav className="bottom-nav" aria-label="Navegação móvel">
      {items.map(({ to, label, icon, badgeKey }) => {
        const isActive = location.pathname === to || location.pathname.startsWith(to + '/');
        const badgeCount = badgeKey ? badges[badgeKey] : 0;
        return (
          <Link
            key={to}
            to={to}
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="bottom-nav-icon-wrap">
              <Icon width="22" height="22">{icon}</Icon>
              {badgeCount > 0 && <span className="bottom-nav-badge">{badgeCount > 99 ? '99+' : badgeCount}</span>}
            </span>
            <span className="bottom-nav-label">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export default BottomNav;
