import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute'
import ChatPage from './pages/ChatPage'
import ProfilePage from './pages/ProfilePage'
import SignInPage from './pages/SignInPage'
import SignUpPage from './pages/SignUpPage'
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
            </Route>
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
