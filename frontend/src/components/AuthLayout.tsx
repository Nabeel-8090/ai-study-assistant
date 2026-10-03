import type { ReactNode } from 'react'
import { ThemeToggle } from '../theme'

/** Shared card shell for the sign-in and sign-up pages. */
export function AuthLayout({ title, subtitle, children }: { title: string, subtitle: string, children: ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-top"><ThemeToggle /></div>
      <section className="auth-card">
        <img src="/favicon.png" alt="" className="auth-logo" />
        <h1>{title}</h1>
        <p className="auth-sub">{subtitle}</p>
        {children}
      </section>
    </main>
  )
}
