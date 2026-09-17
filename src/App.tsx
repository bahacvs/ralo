/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, lazy, Suspense } from 'react';
import { ThemeProvider } from './context/ThemeContext.js';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { LocationProvider } from './context/LocationContext.js';
import { PushNotificationProvider } from './context/PushNotificationContext.js';
import { PushNotificationAlert } from './components/common/PushNotificationAlert.js';
import { LocationPromptModal } from './components/common/LocationPromptModal.js';
import { Header } from './components/common/Header.js';
import { BottomNav } from './components/common/BottomNav.js';
import { PWAInstallBanner, OfflineIndicator } from './components/common/PWAInstallBanner.js';

// The home and sign-in screens load with the app; every other screen is its own chunk
import { HomeView } from './components/player/HomeView.js';
import { LoginView } from './components/player/LoginView.js';
import { EmailVerificationBanner } from './components/common/EmailVerificationBanner.js';

/** lazy() for named exports. */
function lazyNamed<M extends Record<string, any>, K extends keyof M>(load: () => Promise<M>, name: K) {
  return lazy(() => load().then(module => ({ default: module[name] as React.ComponentType<any> })));
}

// Player views
const CourtsView = lazyNamed(() => import('./components/player/CourtsView.js'), 'CourtsView');
const CourtDetailView = lazyNamed(() => import('./components/player/CourtDetailView.js'), 'CourtDetailView');
const OpenMatchesView = lazyNamed(() => import('./components/player/OpenMatchesView.js'), 'OpenMatchesView');
const OpenMatchDetailView = lazyNamed(() => import('./components/player/OpenMatchDetailView.js'), 'OpenMatchDetailView');
const MyMatchesView = lazyNamed(() => import('./components/player/MyMatchesView.js'), 'MyMatchesView');
const MessagesView = lazyNamed(() => import('./components/player/MessagesView.js'), 'MessagesView');
const ProfileView = lazyNamed(() => import('./components/player/ProfileView.js'), 'ProfileView');
const AccountPrivacyView = lazyNamed(() => import('./components/player/AccountPrivacyView.js'), 'AccountPrivacyView');
const LeaderboardView = lazyNamed(() => import('./components/player/LeaderboardView.js'), 'LeaderboardView');
const VerifyEmailView = lazyNamed(() => import('./components/player/AuthLinkViews.js'), 'VerifyEmailView');
const ResetPasswordView = lazyNamed(() => import('./components/player/AuthLinkViews.js'), 'ResetPasswordView');
const FeedView = lazyNamed(() => import('./components/player/FeedView.js'), 'FeedView');
const LegalDocumentView = lazyNamed(() => import('./components/player/LegalDocumentView.js'), 'LegalDocumentView');
const LessonsView = lazyNamed(() => import('./components/player/LessonsView.js'), 'LessonsView');
const LessonDetailView = lazyNamed(() => import('./components/player/LessonDetailView.js'), 'LessonDetailView');
const CoachView = lazyNamed(() => import('./components/coach/CoachView.js'), 'CoachView');

// Business panel
const PanelLayout = lazyNamed(() => import('./components/panel/PanelLayout.js'), 'PanelLayout');
const PanelCalendarView = lazyNamed(() => import('./components/panel/PanelCalendarView.js'), 'PanelCalendarView');
const PanelReservationsView = lazyNamed(() => import('./components/panel/PanelReservationsView.js'), 'PanelReservationsView');
const PanelCourtsView = lazyNamed(() => import('./components/panel/PanelCourtsView.js'), 'PanelCourtsView');
const PanelStaffView = lazyNamed(() => import('./components/panel/PanelStaffView.js'), 'PanelStaffView');
const PanelReportsView = lazyNamed(() => import('./components/panel/PanelReportsView.js'), 'PanelReportsView');
const PanelStatementsView = lazyNamed(() => import('./components/panel/PanelStatementsView.js'), 'PanelStatementsView');
const PanelCoachesView = lazyNamed(() => import('./components/panel/PanelCoachesView.js'), 'PanelCoachesView');

// Platform admin
const AdminLayout = lazyNamed(() => import('./components/admin/AdminLayout.js'), 'AdminLayout');
const AdminOverviewView = lazyNamed(() => import('./components/admin/AdminOverviewView.js'), 'AdminOverviewView');
const AdminClubsView = lazyNamed(() => import('./components/admin/AdminClubsView.js'), 'AdminClubsView');
const AdminClubDetailView = lazyNamed(() => import('./components/admin/AdminClubDetailView.js'), 'AdminClubDetailView');
const AdminFeesView = lazyNamed(() => import('./components/admin/AdminFeesView.js'), 'AdminFeesView');
const AdminStatementsView = lazyNamed(() => import('./components/admin/AdminStatementsView.js'), 'AdminStatementsView');
const AdminUsersView = lazyNamed(() => import('./components/admin/AdminUsersView.js'), 'AdminUsersView');
const AdminErrorsView = lazyNamed(() => import('./components/admin/AdminErrorsView.js'), 'AdminErrorsView');

const RouteLoading: React.FC = () => (
  <div className="min-h-[40vh] flex items-center justify-center" role="status" aria-live="polite">
    <span className="w-8 h-8 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" aria-hidden="true" />
    <span className="sr-only">Yükleniyor...</span>
  </div>
);

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
      if (currentRoute === '/admin/hatalar') return <AdminErrorsView />;
      return <AdminOverviewView />;
    };
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 antialiased font-sans overflow-x-hidden w-full">
        <Suspense fallback={<RouteLoading />}>
          <AdminLayout>
            <Suspense fallback={<RouteLoading />}>{renderAdmin()}</Suspense>
          </AdminLayout>
        </Suspense>
      </div>
    );
  }

  if (isPanelRoute) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 antialiased font-sans flex flex-col justify-between transition-colors duration-200 overflow-x-hidden w-full">
        <div>
          <PushNotificationAlert />
          <PWAInstallBanner />
          <Suspense fallback={<RouteLoading />}>
            <PanelLayout>
              <Suspense fallback={<RouteLoading />}>{renderRoute()}</Suspense>
            </PanelLayout>
          </Suspense>
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
          <Suspense fallback={<RouteLoading />}>{renderRoute()}</Suspense>
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

