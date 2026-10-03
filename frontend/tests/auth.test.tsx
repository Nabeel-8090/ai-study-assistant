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
  id: '1', full_name: 'Sheikh Nabeel', username: 'sheikh8090', email: 'sheikh@gmail.com',
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
    vi.spyOn(authApi, 'fetchMe').mockReturnValue(new Promise(() => { }))
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
    fireEvent.change(await screen.findByLabelText('Username or email'), { target: { value: 'sheikh8090' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-pass-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('textbox', { name: 'Your message' })).toBeTruthy()
    expect(login).toHaveBeenCalledWith('sheikh8090', 'secret-pass-1')
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
    fill({ username: 'sheikh8090' })
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
    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(screen.getByText('Use at least 8 characters.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Sign up' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('creates the account, then asks the user to sign in (no automatic login)', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    const signup = vi.spyOn(authApi, 'signup').mockResolvedValue(USER)
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ name: 'Sheikh Nabeel', username: 'sheikh8090', email: 'sheikh@gmail.com', password: 'secret-pass-1' })
    await screen.findByText('✓ Username is available.')
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }))
    expect(await screen.findByText('Account created. Please sign in.')).toBeTruthy()
    expect(window.location.pathname).toBe('/signin')
    expect(signup).toHaveBeenCalledWith({ full_name: 'Sheikh Nabeel', username: 'sheikh8090', email: 'sheikh@gmail.com', password: 'secret-pass-1' })
  })

  it('shows the server error when the email is already registered', async () => {
    vi.spyOn(authApi, 'fetchMe').mockResolvedValue(null)
    vi.spyOn(authApi, 'checkUsername').mockResolvedValue({ available: true, reason: null })
    vi.spyOn(authApi, 'signup').mockRejectedValue(
      new ApiError('An account with this email already exists.', false, 409, { email: 'An account with this email already exists.' }),
    )
    openAt('/signup')
    await screen.findByLabelText('Full name')
    fill({ name: 'A B', username: 'valid_name', email: 'sheikh@gmail.com', password: 'secret-pass-1' })
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
    expect(await screen.findByRole('heading', { name: 'Sheikh Nabeel' })).toBeTruthy()
    expect(screen.getByText('sheikh@gmail.com')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(logout).toHaveBeenCalled()
  })
})
