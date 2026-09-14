/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ThemeProvider } from './context/ThemeContext.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LocationProvider } from './context/LocationContext.js';
import { PushNotificationProvider } from './context/PushNotificationContext.js';
import { PushNotificationAlert } from './components/common/PushNotificationAlert.js';
import { LocationPromptModal } from './components/common/LocationPromptModal.js';
import { Header } from './components/common/Header.js';
import { BottomNav } from './components/common/BottomNav.js';
import { PWAInstallBanner, OfflineIndicator } from './components/common/PWAInstallBanner.js';

// Player Views
import { HomeView } from './components/player/HomeView.js';
import { CourtsView } from './components/player/CourtsView.js';
import { CourtDetailView } from './components/player/CourtDetailView.js';
import { OpenMatchesView } from './components/player/OpenMatchesView.js';
import { OpenMatchDetailView } from './components/player/OpenMatchDetailView.js';
import { MyMatchesView } from './components/player/MyMatchesView.js';
import { MessagesView } from './components/player/MessagesView.js';
import { ProfileView } from './components/player/ProfileView.js';
import { AccountPrivacyView } from './components/player/AccountPrivacyView.js';
import { LeaderboardView } from './components/player/LeaderboardView.js';
import { LoginView } from './components/player/LoginView.js';
import { FeedView } from './components/player/FeedView.js';

// Business Panel Views & Layout
import { PanelLayout } from './components/panel/PanelLayout.js';
import { PanelCalendarView } from './components/panel/PanelCalendarView.js';
import { PanelReservationsView } from './components/panel/PanelReservationsView.js';
import { PanelCourtsView } from './components/panel/PanelCourtsView.js';
import { PanelStaffView } from './components/panel/PanelStaffView.js';
import { PanelReportsView } from './components/panel/PanelReportsView.js';

const AppContent: React.FC = () => {
  const { currentRoute } = useAuth();

  // Route matching logic
  const isPanelRoute = currentRoute.startsWith('/panel');

  const renderRoute = () => {
    // Business Panel Routes
    if (isPanelRoute) {
      if (currentRoute.includes('/takvim') || currentRoute.endsWith('/panel') || currentRoute.match(/^\/panel\/[^/]+$/)) {
        return <PanelCalendarView />;
      }
      if (currentRoute.includes('/rezervasyonlar')) {
        return <PanelReservationsView />;
      }
      if (currentRoute.includes('/kortlar')) {
        return <PanelCourtsView />;
      }
      if (currentRoute.includes('/personel')) {
        return <PanelStaffView />;
      }
      if (currentRoute.includes('/raporlar')) {
        return <PanelReportsView />;
      }
      return <PanelCalendarView />;
    }

    // Player Routes
    if (currentRoute === '/giris') {
      return <LoginView />;
    }
    if (currentRoute.startsWith('/saha/')) {
      return <CourtDetailView />;
    }
    if (currentRoute.startsWith('/acik-mac/')) {
      return <OpenMatchDetailView />;
    }
    if (currentRoute === '/sahalar') {
      return <CourtsView />;
    }
    if (currentRoute === '/acik-maclar') {
      return <OpenMatchesView />;
    }
    if (currentRoute === '/akis' || currentRoute === '/sosyal-ag') {
      return <FeedView />;
    }
    if (currentRoute === '/maclarim') {
      return <MyMatchesView />;
    }
    if (currentRoute === '/mesajlar') {
      return <MessagesView />;
    }
    if (currentRoute === '/profil') {
      return <ProfileView />;
    }
    if (currentRoute === '/hesap-ve-gizlilik') {
      return <AccountPrivacyView />;
    }
    if (currentRoute === '/siralama') {
      return <LeaderboardView />;
    }

    // Default fallback to Home
    return <HomeView />;
  };

  if (isPanelRoute) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans flex flex-col justify-between transition-colors duration-200 overflow-x-hidden w-full">
        <div>
          <PushNotificationAlert />
          <PWAInstallBanner />
          <PanelLayout>
            {renderRoute()}
          </PanelLayout>
        </div>
        <OfflineIndicator />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans flex flex-col justify-between transition-colors duration-200 overflow-x-hidden w-full">
      <div className="w-full overflow-x-hidden">
        <PushNotificationAlert />
        <PWAInstallBanner />
        <Header />
        <main id="main-content" tabIndex={-1} className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-28 sm:pb-16 outline-none">
          {renderRoute()}
        </main>
      </div>
      <BottomNav />
      <OfflineIndicator />
      <LocationPromptModal />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <PushNotificationProvider>
          <LocationProvider>
            <AppContent />
          </LocationProvider>
        </PushNotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

