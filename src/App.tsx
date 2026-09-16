/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
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
import { VerifyEmailView, ResetPasswordView } from './components/player/AuthLinkViews.js';
import { EmailVerificationBanner } from './components/common/EmailVerificationBanner.js';
import { FeedView } from './components/player/FeedView.js';
import { LegalDocumentView } from './components/player/LegalDocumentView.js';
import { LessonsView } from './components/player/LessonsView.js';
import { LessonDetailView } from './components/player/LessonDetailView.js';
import { CoachView } from './components/coach/CoachView.js';
import { PanelCoachesView } from './components/panel/PanelCoachesView.js';

// Business Panel Views & Layout
import { PanelLayout } from './components/panel/PanelLayout.js';
import { PanelCalendarView } from './components/panel/PanelCalendarView.js';
import { PanelReservationsView } from './components/panel/PanelReservationsView.js';
import { PanelCourtsView } from './components/panel/PanelCourtsView.js';
import { PanelStaffView } from './components/panel/PanelStaffView.js';
import { PanelReportsView } from './components/panel/PanelReportsView.js';
import { PanelStatementsView } from './components/panel/PanelStatementsView.js';

// Platform admin
import { AdminLayout } from './components/admin/AdminLayout.js';
import { AdminOverviewView } from './components/admin/AdminOverviewView.js';
import { AdminClubsView } from './components/admin/AdminClubsView.js';
import { AdminClubDetailView } from './components/admin/AdminClubDetailView.js';
import { AdminFeesView } from './components/admin/AdminFeesView.js';
import { AdminStatementsView } from './components/admin/AdminStatementsView.js';
import { AdminUsersView } from './components/admin/AdminUsersView.js';

const PROTECTED_PLAYER_ROUTES = ['/maclarim', '/mesajlar', '/profil', '/hesap-ve-gizlilik', '/antrenor'];

const AppContent: React.FC = () => {
  const { currentRoute, user, isLoading, navigate, setReturnTo } = useAuth();

  // Route matching logic
  const isPanelRoute = currentRoute.startsWith('/panel');
  const isAdminRoute = currentRoute === '/admin' || currentRoute.startsWith('/admin/');
  const needsLogin = !user && (isPanelRoute || isAdminRoute || PROTECTED_PLAYER_ROUTES.includes(currentRoute));
  const needsBusinessRole = !!user && isPanelRoute && user.role === 'OYUNCU';
  const needsPlatformAdmin = !!user && isAdminRoute && !user.isPlatformAdmin;

  useEffect(() => {
    if (isLoading) return;
    if (needsLogin) {
      setReturnTo(currentRoute);
      navigate('/giris');
    } else if (needsBusinessRole || needsPlatformAdmin) {
      navigate('/ana');
    }
  }, [isLoading, needsLogin, needsBusinessRole, needsPlatformAdmin, currentRoute]);

  if (isLoading || needsLogin || needsBusinessRole || needsPlatformAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950" role="status" aria-live="polite">
        <span className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" aria-hidden="true" />
        <span className="sr-only">Yükleniyor...</span>
      </div>
    );
  }

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
      if (currentRoute.includes('/hesap-ozetleri')) {
        return <PanelStatementsView />;
      }
      if (currentRoute.includes('/antrenorler')) {
        return <PanelCoachesView />;
      }
      return <PanelCalendarView />;
    }

    // Player Routes
    if (currentRoute === '/giris') {
      return <LoginView />;
    }
    if (currentRoute === '/eposta-dogrula') {
      return <VerifyEmailView />;
    }
    if (currentRoute === '/sifre-sifirla') {
      return <ResetPasswordView />;
    }
    if (currentRoute.startsWith('/yasal/')) {
      return <LegalDocumentView />;
    }
    if (currentRoute === '/dersler') {
      return <LessonsView />;
    }
    if (currentRoute.startsWith('/ders/')) {
      return <LessonDetailView />;
    }
    if (currentRoute === '/antrenor') {
      return <CoachView />;
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

  if (isAdminRoute) {
    const renderAdmin = () => {
      if (currentRoute.startsWith('/admin/kulupler/')) return <AdminClubDetailView />;
      if (currentRoute === '/admin/kulupler') return <AdminClubsView />;
      if (currentRoute === '/admin/ucretler') return <AdminFeesView />;
      if (currentRoute === '/admin/hesap-ozetleri') return <AdminStatementsView />;
      if (currentRoute === '/admin/kullanicilar') return <AdminUsersView />;
      return <AdminOverviewView />;
    };
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans overflow-x-hidden w-full">
        <AdminLayout>{renderAdmin()}</AdminLayout>
      </div>
    );
  }

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
        <EmailVerificationBanner />
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

