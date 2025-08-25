import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';

import { useAuth } from './hooks/useAuth';
import { usePWA } from './hooks/usePWA';

// Layout Components
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/UI/LoadingSpinner';

// Public Pages
import HomePage from './pages/Home/HomePage';
import LoginPage from './pages/Auth/LoginPage';
import RegisterPage from './pages/Auth/RegisterPage';
import ForgotPasswordPage from './pages/Auth/ForgotPasswordPage';
import ResetPasswordPage from './pages/Auth/ResetPasswordPage';

// Protected Pages
import DashboardPage from './pages/Dashboard/DashboardPage';
import CoursesPage from './pages/Courses/CoursesPage';
import CourseDetailPage from './pages/Courses/CourseDetailPage';
import LessonPage from './pages/Courses/LessonPage';
import AICoachPage from './pages/AICoach/AICoachPage';
import CommunityPage from './pages/Community/CommunityPage';
import GroupDetailPage from './pages/Community/GroupDetailPage';
import ProfilePage from './pages/Profile/ProfilePage';

// Components
import ProtectedRoute from './components/Auth/ProtectedRoute';
import PWAInstallPrompt from './components/PWA/PWAInstallPrompt';
import OfflineIndicator from './components/PWA/OfflineIndicator';

function App() {
  const { isLoading } = useAuth();
  const { isOnline, isInstallable } = usePWA();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="App">
      {/* Offline Indicator */}
      {!isOnline && <OfflineIndicator />}
      
      {/* PWA Install Prompt */}
      {isInstallable && <PWAInstallPrompt />}

      <AnimatePresence mode="wait">
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/courses"
            element={
              <ProtectedRoute>
                <Layout>
                  <CoursesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/courses/:courseId"
            element={
              <ProtectedRoute>
                <Layout>
                  <CourseDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/courses/:courseId/lessons/:lessonId"
            element={
              <ProtectedRoute>
                <Layout>
                  <LessonPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/coach"
            element={
              <ProtectedRoute>
                <Layout>
                  <AICoachPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/community"
            element={
              <ProtectedRoute>
                <Layout>
                  <CommunityPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/community/groups/:groupId"
            element={
              <ProtectedRoute>
                <Layout>
                  <GroupDetailPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Layout>
                  <ProfilePage />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Fallback Routes */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </div>
  );
}

export default App;