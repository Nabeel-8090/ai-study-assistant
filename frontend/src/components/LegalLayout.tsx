import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { APP_NAME, CONTACT_EMAIL, LAST_UPDATED } from '../legal'
import { ThemeToggle } from '../theme'

/** Page shell shared by /terms and /privacy. These pages are public: no login needed. */
export function LegalLayout({ title, children }: { title: string, children: ReactNode }) {
  return (
    <div className="app">
      <header className="bar">
        <Link to="/" className="back-link">← {APP_NAME}</Link>
        <ThemeToggle />
      </header>
      <div className="scroll">
        <main className="legal">
          <article>
            <h1>{title}</h1>
            <p className="muted">Last updated: {LAST_UPDATED}</p>
            {children}
            <h2>Contact</h2>
            <p>
              {CONTACT_EMAIL
                ? <>Questions about this page? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</>
                : 'Questions about this page? Please contact the administrator of this service.'}
            </p>
            <p className="legal-links">
              <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link>
            </p>
          </article>
        </main>
      </div>
    </div>
  )
}
