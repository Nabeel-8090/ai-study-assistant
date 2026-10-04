/**
 * Shared facts used by the Terms of Service and Privacy Policy pages.
 *
 * When you change the legal text, update LAST_UPDATED here AND TERMS_VERSION in
 * backend/app/core/legal.py (use the same date), so the database records which
 * version each new user accepted.
 */
export const LAST_UPDATED = 'October 3, 2026'
export const APP_NAME = 'RAGGG'

/** Optional. Set VITE_CONTACT_EMAIL in frontend/.env to show a real contact address. */
export const CONTACT_EMAIL: string = String(import.meta.env.VITE_CONTACT_EMAIL ?? '').trim()
