import { LegalLayout } from '../components/LegalLayout'
import { APP_NAME } from '../legal'

/*
 * TEMPLATE TEXT. It describes what this app really does today, but it is not legal advice.
 * Review it, adjust it to your situation and country, and update it whenever the app changes
 * (for example when conversations start being saved in the database).
 * When you change it, update LAST_UPDATED (src/legal.ts) and TERMS_VERSION (backend/app/core/legal.py).
 */
export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>This page explains what {APP_NAME} collects, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your full name, username and email address.</li>
        <li>
          <strong>Password:</strong> never stored as text. We keep only a one-way hash (Argon2id), which
          cannot be turned back into your password.
        </li>
        <li><strong>Profile picture</strong> (optional): resized and stored with your account.</li>
        <li>
          <strong>Agreement record:</strong> the date you accepted our Terms and Privacy Policy, and
          which version.
        </li>
        <li>
          <strong>Email codes:</strong> the 6-digit codes we email you to verify your address or reset
          your password. They expire quickly and are stored only in scrambled form.
        </li>
        <li>
          <strong>Login session:</strong> a random token kept in a cookie so you stay signed in. We
          store only a hash of it, and it expires automatically.
        </li>
        <li>
          <strong>Your questions:</strong> the messages you type into the assistant are sent to generate
          an answer. At the moment they are not saved in our database. If we add saved chat history,
          we will update this policy first.
        </li>
        <li>
          <strong>Technical logs:</strong> basic server logs (such as errors and response times) used to
          keep the Service working. We try not to put passwords or message text in logs.
        </li>
      </ul>

      <h2>Cookies and browser storage</h2>
      <p>
        We use one essential cookie to keep you signed in; the Service does not work without it. Your
        browser also remembers your light/dark theme choice. We do not use advertising or tracking cookies.
      </p>

      <h2>Why we use your data</h2>
      <p>
        To create and secure your account, send you verification and password-reset emails, show your
        profile, and provide AI answers. We do not sell your personal data.
      </p>

      <h2>Who else handles it</h2>
      <ul>
        <li><strong>Google (Gemini API):</strong> receives your questions to produce answers.</li>
        <li><strong>Our database host:</strong> stores your account data.</li>
        <li><strong>Our email provider:</strong> delivers the codes we email you.</li>
      </ul>
      <p>These providers process data on our behalf under their own terms and privacy policies. We may also disclose information if the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>
        Account details are kept while your account exists. Email codes expire within minutes and
        login sessions expire automatically. If you ask us to delete your account, we will remove
        your account data.
      </p>

      <h2>Your choices</h2>
      <p>
        You can change your profile picture or remove it on your profile page, reset your password at
        any time, and log out to end your session. You may ask us to access, correct or delete your
        data by contacting us (see below).
      </p>

      <h2>Security</h2>
      <p>
        We protect your data with hashed passwords, secure cookies, and access checks on every request.
        No system is perfectly secure, so please use a strong, unique password.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, we will update the date at the top of this page.</p>
    </LegalLayout>
  )
}
