import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy — Servl',
  description: 'How Servl collects, uses, and protects your data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-bg px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <img src="/servl-logo.svg" alt="Servl" width={160} />
          <div>
            <h1 className="text-2xl font-semibold text-text">Privacy Policy</h1>
            <p className="text-sm text-text-tertiary">Last updated 11 June 2026</p>
          </div>
        </div>

        <div className="space-y-8 rounded-2xl border border-border bg-surface p-6 text-sm leading-relaxed text-text-secondary sm:p-10">
          <section className="space-y-3">
            <p>
              Servl (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) provides a smart pet
              feeder system consisting of an Android app, this website, a Wi-Fi connected
              feeder device, and supporting cloud services. This Privacy Policy explains
              what information we collect, how we use it, and the choices you have.
            </p>
            <p>
              By creating an account or using the Servl app, website, or feeder device, you
              agree to the collection and use of information as described here.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Information we collect</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-text">Account information</span> — your
                name, email address, and a securely hashed password (we never store your
                password in plain text). If you create or join a household, we store your
                role within that household (owner or member).
              </li>
              <li>
                <span className="font-medium text-text">Profile photo</span> — an optional
                profile picture you upload.
              </li>
              <li>
                <span className="font-medium text-text">Pet information</span> — names,
                types, photos, and feeding configuration (schedules, portion sizes) for the
                pets you add.
              </li>
              <li>
                <span className="font-medium text-text">Feed history</span> — a record of
                every feed dispensed for your pets, including the time, requested and
                actual weight dispensed, and how it was triggered (manually, on a schedule,
                via voice assistant, or via the physical button on the feeder).
              </li>
              <li>
                <span className="font-medium text-text">Device information</span> — your
                feeder&apos;s identifier, connection status, hopper level, firmware version,
                and an error/event log used for diagnostics and low-hopper alerts.
              </li>
              <li>
                <span className="font-medium text-text">Push notification token</span> — if
                you enable notifications, we store a Firebase Cloud Messaging token used to
                deliver alerts (e.g. low hopper level) to your device.
              </li>
              <li>
                <span className="font-medium text-text">Google account information</span> —
                if you sign in with Google, or link your Servl account to Google Home, we
                receive your Google account identifier and email address from Google to
                authenticate you. We never receive or store your Google password.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">How we use your information</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>To create and maintain your account and household.</li>
              <li>To schedule, trigger, and confirm feeds dispensed by your feeder.</li>
              <li>To show you feed history and statistics for your pets.</li>
              <li>
                To send you notifications about your feeder, such as a low hopper-level
                warning.
              </li>
              <li>
                To enable voice control of your feeder through Google Home (see below).
              </li>
              <li>To maintain the security and reliability of the service.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">
              Google Home account linking
            </h2>
            <p>
              If you choose to link your Servl account with Google Home, Google is given a
              limited authorization token that allows it to ask our servers for the list of
              feeders in your household (presented to Google as &quot;pet feeder&quot;
              devices) and to send dispense commands on your behalf (e.g. &quot;Hey Google,
              feed Luna&quot;). This token does not give Google access to your Servl
              password, and does not allow Google to access any data beyond your pets&apos;
              names, feeder status, and feed commands.
            </p>
            <p>
              You can unlink your account at any time from the Google Home app (Settings →
              Linked accounts) or from your Google Account&apos;s
              {' '}
              <span className="font-medium text-text">Connected apps &amp; services</span>
              {' '}
              page. Unlinking immediately revokes Google&apos;s access to your Servl
              account.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">How we share your information</h2>
            <p>We do not sell your personal information. We share data only with:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <span className="font-medium text-text">Google</span> — for Google Sign-In
                and, if you choose to enable it, Google Home account linking, as described
                above.
              </li>
              <li>
                <span className="font-medium text-text">Firebase Cloud Messaging</span> —
                to deliver push notifications to your devices, if enabled.
              </li>
              <li>
                <span className="font-medium text-text">Email delivery provider</span> — to
                send transactional emails such as password resets and household invites.
              </li>
            </ul>
            <p>
              Other members of your household can see the pets, schedules, devices, and
              feed history associated with that household.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Data retention</h2>
            <p>
              Feed history is retained as part of your pet&apos;s record so that statistics
              and history remain accurate over time, even if a pet is later removed from
              the app. Account, pet, and device data is retained for as long as your
              account is active.
            </p>
            <p>
              To request deletion of your account and associated data, contact us using the
              details below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Data security</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>Passwords are hashed using bcrypt and never stored in plain text.</li>
              <li>All communication between the app, website, and our servers is encrypted in transit (TLS).</li>
              <li>Communication between your feeder and our servers uses authenticated MQTT connections.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Your rights</h2>
            <p>
              You can access and update most of your information directly within the app or
              website, including your profile, pets, schedules, and notification settings.
              You can revoke Google account linking at any time as described above. To
              request a copy of your data, or to request that it be deleted, contact us
              using the details below.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Children&apos;s privacy</h2>
            <p>
              Servl is not directed at children under 13, and we do not knowingly collect
              personal information from children under 13.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Changes to this policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Material changes will be
              reflected by updating the &quot;Last updated&quot; date at the top of this
              page.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-text">Contact us</h2>
            <p>
              If you have questions about this Privacy Policy or your data, contact us at{' '}
              <a href="mailto:privacy@servl.uk" className="text-primary hover:underline">
                privacy@servl.uk
              </a>
              .
            </p>
          </section>
        </div>

        <p className="mt-6 text-center text-xs text-text-tertiary">
          <Link href="/" className="text-primary hover:underline">
            Back to Servl
          </Link>
        </p>
      </div>
    </div>
  );
}
