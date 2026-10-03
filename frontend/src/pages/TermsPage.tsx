import { LegalLayout } from '../components/LegalLayout'
import { APP_NAME } from '../legal'

/*
 * TEMPLATE TEXT. It describes what this app really does today, but it is not legal advice.
 * Before you launch publicly, read it, adjust it to your situation and country, and ideally
 * have it reviewed. When you change it, update LAST_UPDATED (src/legal.ts) and
 * TERMS_VERSION (backend/app/core/legal.py).
 */
export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        By creating an account or using {APP_NAME} (the &quot;Service&quot;), you agree to these terms.
        If you do not agree, please do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        {APP_NAME} is a study helper. You type questions, and an artificial-intelligence model
        generates answers. It is provided for learning and general information.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>Give accurate information when you sign up, and verify your email address.</li>
        <li>Keep your password private. You are responsible for activity under your account.</li>
        <li>Tell us if you think someone else has accessed your account.</li>
        <li>You must be old enough to agree to these terms where you live, or have a parent or guardian&apos;s permission.</li>
      </ul>

      <h2>3. AI answers can be wrong</h2>
      <p>
        Answers are generated automatically and may be incomplete, outdated or incorrect. Check
        important facts against reliable sources. Do not rely on the Service for medical, legal,
        financial or safety decisions, and do not treat it as a replacement for your teachers.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>break the law or use the Service to harm, harass or deceive others;</li>
        <li>try to break into the Service, other accounts, or its systems, or disrupt it;</li>
        <li>send automated or excessive requests, or try to bypass limits;</li>
        <li>upload images or text that you do not have the right to use, or that are unlawful or abusive;</li>
        <li>submit sensitive personal data about other people.</li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You keep ownership of what you submit (such as your questions and profile picture). You give
        us permission to process it only as needed to run the Service, including sending your
        questions to our AI provider to produce answers.
      </p>

      <h2>6. Availability and changes</h2>
      <p>
        The Service is provided &quot;as is&quot;. It may change, be interrupted or be discontinued at any
        time. We may update these terms; when we do, we will change the date above and may ask you
        to accept the new version.
      </p>

      <h2>7. Ending your use</h2>
      <p>
        You may stop using the Service at any time. To have your account deleted, contact us (see
        below). We may suspend or close accounts that break these terms or put the Service at risk.
      </p>

      <h2>8. Limits of liability</h2>
      <p>
        To the extent allowed by law, we are not liable for indirect or consequential losses, or for
        decisions you make based on AI-generated answers. Nothing here limits rights that the law
        gives you and that cannot be waived.
      </p>
    </LegalLayout>
  )
}
