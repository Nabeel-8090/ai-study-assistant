import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { ApiError, sendMessage } from '../src/api'
import * as authApi from '../src/authApi'

vi.mock('../src/api', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/api')>(),
  sendMessage: vi.fn(),
}))

const USER = {
  id: '1', full_name: 'Ayesha Khan', username: 'ayesha', email: 'a@example.com',
  created_at: '2026-01-01T00:00:00Z', has_avatar: false, avatar_version: null,
}

function openAt(path: string) {
  window.history.pushState({}, '', path)
  return render(<App />)
}

beforeEach(() => {
  vi.mocked(sendMessage).mockReset()
})

describe('route protection', () => {
  it('sends a visitor who is not logged in from / to the sign-in page', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(window.location.pathname).toBe('/signin')
  })

  it('also protects /profile', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/profile')
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })

  it('shows nothing private while the session is still being checked', () => {
    vi.spyOn(authApi, 'fetchMe').mockReturnValue(new Promise(() => {}))
    openAt('/')
    expect(screen.queryByRole('textbox', { name: 'Your message' })).toBeNull()
    expect(screen.getByRole('status')).toBeTruthy() // the "Loading…" splash
  })

  it('opens the chat directly for a visitor who is already logged in', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(USER)
    openAt('/')
    expect(await screen.findByRole('textbox', { name: 'Your message' })).toBeTruthy()
  })

  it('keeps a logged-in user away from /signin and /signup', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(USER)
    openAt('/signup')
    expect(await screen.findByRole('textbox', { name: 'Your message' })).toBeTruthy()
    expect(window.location.pathname).toBe('/')
  })

  it('returns to sign-in when the server says the session ended (401) during a chat', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(USER)
    vi.mocked(sendMessage).mockRejectedValue(new ApiError('Please sign in.', false, 401))
    openAt('/')
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your message' }), { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
  })
})

describe('sign in', () => {
  it('logs in with username or email and lands on the chat', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    const login = vi.spyOn(authApi, 'login').mockResolvedValue(USER)
    openAt('/signin')
    fireEvent.change(await screen.findByLabelText('Username or email'), { target: { value: 'ayesha' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('textbox', { name: 'Your message' })).toBeTruthy()
    expect(login).toHaveBeenCalledWith('ayesha', 'secret-pass-1')
  })

  it('shows the generic error for wrong credentials', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'login').mockRejectedValue(new ApiError('Incorrect username/email or password.', false, 401))
    openAt('/signin')
    fireEvent.change(await screen.findByLabelText('Username or email'), { target: { value: 'x' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'y' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Incorrect username/email or password.')).toBeTruthy()
  })

  it('links new users to the sign-up page', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/signin')
    fireEvent.click(await screen.findByRole('link', { name: 'Create an account' }))
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeTruthy()
  })
})

describe('sign up', () => {
  function agree() {
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }))
  }

  function fill(values: { name?: string, username?: string, email?: string, password?: string }) {
    if (values.name !== undefined) fireEvent.change(screen.getByLabelText('Full name'), { target: { value: values.name } })
    if (values.username !== undefined) fireEvent.change(screen.getByLabelText('Username'), { target: { value: values.username } })
    if (values.email !== undefined) fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } })
    if (values.password !== undefined) fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } })
  }

  it('tells the user right away when a username is taken', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: false, reason: 'This username is already taken.' })
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ username: 'ayesha' })
    expect(await screen.findByText('This username is already taken.')).toBeTruthy()
  })

  it('confirms an available username', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ username: 'fresh_name' })
    expect(await screen.findByText('✓ Username is available.')).toBeTruthy()
  })

  it('blocks submit for an invalid email or short password', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ name: 'A B', username: 'valid_name', email: 'not-an-email', password: 'short' })
    agree()
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Sign up' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates the account, then asks for the emailed code (no automatic login)', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    const signup = vi.spyOn(authApi, 'signup').mockResolvedValue(USER)
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ name: 'Ayesha Khan', username: 'ayesha', email: 'A@Example.com', password: 'secret-pass-1' })
    agree()
    await screen.findByText('✓ Username is available.')
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeTruthy()
    expect(window.location.pathname).toBe('/verify-email')
    expect(screen.getByText('We sent a 6-digit code to a@example.com.')).toBeTruthy()
    expect(signup).toHaveBeenCalledWith({
      full_name: 'Ayesha Khan', username: 'ayesha', email: 'A@Example.com', password: 'secret-pass-1', accept_terms: true,
    })
  })

  it('keeps Sign up disabled until the terms box is ticked', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ name: 'Ayesha Khan', username: 'ayesha', email: 'a@example.com', password: 'secret-pass-1' })
    await screen.findByText('✓ Username is available.')
    const button = screen.getByRole('button', { name: 'Sign up' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    agree()
    expect(button.disabled).toBe(false)
  })

  it('links to the Terms and Privacy pages in a new tab, so the form is not lost', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/signup')
    await screen.findByLabelText('Full name')
    const terms = screen.getByRole('link', { name: 'Terms of Service' })
    const privacy = screen.getByRole('link', { name: 'Privacy Policy' })
    expect(terms.getAttribute('href')).toBe('/terms')
    expect(privacy.getAttribute('href')).toBe('/privacy')
    expect(terms.getAttribute('target')).toBe('_blank')
    expect(terms.getAttribute('rel')).toContain('noopener')
  })

  it('shows the server error when the email is already registered', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    vi.spyOn(authApi, 'signup').mockRejectedValue(
      new ApiError('An account with this email already exists.', false, 409, { email: 'An account with this email already exists.' }),
    )
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ name: 'A B', username: 'valid_name', email: 'a@example.com', password: 'secret-pass-1' })
    agree()
    await screen.findByText('✓ Username is available.')
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    await waitFor(() => expect(screen.getByText('An account with this email already exists.')).toBeTruthy())
  })
})

describe('profile', () => {
  it('shows account details and logs out back to the sign-in page', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(USER)
    const logout = vi.spyOn(authApi, 'logout').mockResolvedValue()
    openAt('/profile')
    expect(await screen.findByRole('heading', { name: 'Ayesha Khan' })).toBeTruthy()
    expect(screen.getByText('a@example.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(logout).toHaveBeenCalled()
  })
})


describe('email verification', () => {
  it('verifies the code and sends the user to sign in with a confirmation', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    const verify = vi.spyOn(authApi, 'verifyEmail').mockResolvedValue()
    openAt('/verify-email')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@example.com' } })
    const submit = screen.getByRole('button', { name: 'Verify email' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '12a3-45 6789' } })
    expect((screen.getByLabelText('6-digit code') as HTMLInputElement).value).toBe('123456') // digits only, max 6
    fireEvent.click(submit)
    expect(await screen.findByText('Email verified. You can now sign in.')).toBeTruthy()
    expect(window.location.pathname).toBe('/signin')
    expect(verify).toHaveBeenCalledWith('a@example.com', '123456')
  })

  it('shows the server message for a wrong or expired code', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'verifyEmail').mockRejectedValue(new ApiError('That code is incorrect or has expired.', false, 400))
    openAt('/verify-email')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    expect(await screen.findByText('That code is incorrect or has expired.')).toBeTruthy()
  })

  it('sends an unverified user who signs in to the verification page and emails a fresh code', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'login').mockRejectedValue(
      new ApiError('Please verify your email address to continue.', false, 403, undefined,
        { code: 'email_not_verified', email: 'a@example.com' }),
    )
    const resend = vi.spyOn(authApi, 'resendVerification').mockResolvedValue()
    openAt('/signin')
    fireEvent.change(await screen.findByLabelText('Username or email'), { target: { value: 'ayesha' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Verify your email' })).toBeTruthy()
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('a@example.com')
    await waitFor(() => expect(resend).toHaveBeenCalledWith('a@example.com'))
  })

  it('disables Resend during the cooldown after a code was just sent', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/verify-email')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@example.com' } })
    // No code was just sent (user typed the address by hand), so Resend is available.
    const resendBtn = screen.getByRole('button', { name: 'Resend code' }) as HTMLButtonElement
    expect(resendBtn.disabled).toBe(false)
    const resend = vi.spyOn(authApi, 'resendVerification').mockResolvedValue()
    fireEvent.click(resendBtn)
    expect(await screen.findByRole('button', { name: /Resend code in \d+s/ })).toBeTruthy()
    expect((screen.getByRole('button', { name: /Resend code in/ }) as HTMLButtonElement).disabled).toBe(true)
    expect(resend).toHaveBeenCalledWith('a@example.com')
  })
})

describe('forgot and reset password', () => {
  it('offers a Forgot password link on the sign-in page', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/signin')
    fireEvent.click(await screen.findByRole('link', { name: 'Forgot password?' }))
    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeTruthy()
  })

  it('requests a code and moves on to the reset page without revealing whether the account exists', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    const forgot = vi.spyOn(authApi, 'forgotPassword').mockResolvedValue()
    openAt('/forgot-password')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'Someone@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send reset code' }))
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeTruthy()
    expect(forgot).toHaveBeenCalledWith('Someone@Example.com')
    expect(screen.getByText(/If an account exists for that email/)).toBeTruthy()
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('someone@example.com')
  })

  it('does not accept an invalid email on the forgot page', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt('/forgot-password')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'nope' } })
    expect((screen.getByRole('button', { name: 'Send reset code' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('resets the password and returns to sign-in with a confirmation', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    const reset = vi.spyOn(authApi, 'resetPassword').mockResolvedValue()
    openAt('/reset-password')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '654321' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } })
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy()
    const submit = screen.getByRole('button', { name: 'Update password' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-pass-9' } })
    fireEvent.click(submit)
    expect(await screen.findByText('Password updated. Please sign in with your new password.')).toBeTruthy()
    expect(window.location.pathname).toBe('/signin')
    expect(reset).toHaveBeenCalledWith('a@example.com', '654321', 'brand-new-pass-9')
  })

  it('shows the error for a bad reset code and keeps the form', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'resetPassword').mockRejectedValue(new ApiError('That code is incorrect or has expired.', false, 400))
    openAt('/reset-password')
    fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'a@example.com' } })
    fireEvent.change(screen.getByLabelText('6-digit code'), { target: { value: '000000' } })
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'brand-new-pass-9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }))
    expect(await screen.findByText('That code is incorrect or has expired.')).toBeTruthy()
    expect(window.location.pathname).toBe('/reset-password')
  })

  it('keeps logged-in users away from the password-reset pages', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(USER)
    openAt('/forgot-password')
    expect(await screen.findByRole('textbox', { name: 'Your message' })).toBeTruthy()
  })
})

describe('legal pages', () => {
  it.each([
    ['/terms', 'Terms of Service'],
    ['/privacy', 'Privacy Policy'],
  ])('%s is public: visitors who are not signed in can read it', async (path, title) => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    openAt(path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeTruthy()
    expect(window.location.pathname).toBe(path)
  })

  it('/terms is also readable when signed in', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(USER)
    openAt('/terms')
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms of Service' })).toBeTruthy()
  })
})
