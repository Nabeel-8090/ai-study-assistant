import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import ChatPage from './pages/ChatPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import PrivacyPage from './pages/PrivacyPage'
import ProfilePage from './pages/ProfilePage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
import TermsPage from './pages/TermsPage'
import VerifyEmailPage from './pages/VerifyEmailPage'
import { ThemeProvider } from './theme'

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Only for visitors who are NOT logged in */}
            <Route element={<PublicOnlyRoute />}>
              <Route path="/signin" element={<SignInPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/verify-email" element={<VerifyEmailPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>
            {/* Open to everyone, signed in or not (linked from the sign-up form) */}
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            {/* Only for logged-in users. Everyone else is redirected to /signin */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<ChatPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
