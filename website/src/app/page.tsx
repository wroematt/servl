import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  IconBellRinging,
  IconBrandGoogle,
  IconCalendarTime,
  IconMail,
  IconUsers,
} from '@tabler/icons-react';

export const metadata: Metadata = {
  title: 'Servl — Smart Pet Feeder',
  description:
    'Servl is a Wi-Fi connected automatic pet feeder with an Android app, web dashboard, and Google Home voice control. Currently in private beta — register your interest in testing.',
};

const BETA_EMAIL = 'contact@servl.uk';
const BETA_EMAIL_HREF = 'mailto:contact@servl.uk?subject=Beta%20tester%20interest';

const features = [
  {
    icon: IconCalendarTime,
    title: 'Scheduled feeding',
    description:
      'Set recurring feed times for each pet. Servl dispenses precise portions automatically, right on schedule.',
  },
  {
    icon: IconUsers,
    title: 'Shared households',
    description:
      'Everyone in your home can manage feeding from the app or website, with a full history of every feed.',
  },
  {
    icon: IconBrandGoogle,
    title: 'Voice control',
    description:
      '"Hey Google, feed Felix" — link your account to Google Home for hands-free feeding on demand.',
  },
  {
    icon: IconBellRinging,
    title: 'Hopper alerts',
    description:
      'Get a push notification before the hopper runs low, so your pets never miss a meal.',
  },
];

const gallery = [
  { src: '/images/gallery-cat-2.png', alt: 'A grey cat sitting on a windowsill in a bright, minimalist room' },
  { src: '/images/gallery-dog-1.png', alt: 'A golden retriever relaxing in a calm, minimalist living room' },
  { src: '/images/gallery-dog-3.png', alt: 'A dog resting in a bed in a bright kitchen with a potted olive tree' },
];

const navButton = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-bg">
      {/* Beta banner */}
      <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-white sm:text-sm">
        Servl pet feeders aren&apos;t available to buy yet — we&apos;re running a private beta.{' '}
        <a href={BETA_EMAIL_HREF} className="underline underline-offset-2 hover:no-underline">
          Register your interest
        </a>
      </div>

      {/* Nav */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <img src="/servl-logo-banner.svg" alt="Servl" className="h-7 w-auto" />
          <div className="flex items-center gap-2">
            <Link href="/login" className={`${navButton} border border-border-strong text-text hover:bg-border`}>
              Log in
            </Link>
            <a href={BETA_EMAIL_HREF} className={`${navButton} bg-primary text-white hover:bg-primary-hover`}>
              Register interest
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <img src="/servl-logo.svg" alt="Servl" width={120} className="mx-auto mb-6 lg:mx-0" />
            <span className="mb-4 inline-flex items-center rounded-full bg-primary-light px-3 py-1 text-xs font-medium text-primary">
              Private beta — coming soon
            </span>
            <h1 className="text-3xl font-semibold text-text sm:text-4xl">
              Automated feeding for happier pets
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary lg:mx-0">
              Servl is a Wi-Fi connected pet feeder that dispenses precise portions of
              dry food on schedule, on demand from the app, or with a simple voice
              command. We&apos;re not on sale yet — we&apos;re putting the finishing
              touches on the hardware and recruiting a small group of beta testers to
              try it at home.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 lg:justify-start">
              <a href={BETA_EMAIL_HREF} className={`${navButton} px-5 py-2.5 text-base bg-primary text-white hover:bg-primary-hover`}>
                Register interest
              </a>
              <Link href="/login" className={`${navButton} px-5 py-2.5 text-base border border-border-strong text-text hover:bg-border`}>
                Log in
              </Link>
            </div>
          </div>
          <div className="order-first lg:order-last">
            <Image
              src="/images/hero-pet.png"
              alt="A grey and tabby cat sitting on a woven rug"
              width={505}
              height={509}
              priority
              className="mx-auto w-full max-w-md rounded-2xl object-cover shadow-sm"
            />
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-xl border border-border bg-surface p-5">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary-light text-primary">
                <Icon size={20} />
              </div>
              <h3 className="text-sm font-semibold text-text">{title}</h3>
              <p className="mt-1.5 text-sm text-text-secondary">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <h2 className="text-lg font-semibold text-text">About Servl</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Servl pairs a Wi-Fi connected hardware feeder with an Android app and this
          web dashboard, so you can manage feeding schedules, monitor hopper levels,
          and review feed history for every pet in your household — from anywhere.
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
          We design and build connected smart-home devices for pet care. The Servl
          feeder is our first product — a Wi-Fi connected hardware device with
          Google Home voice control built in from day one, and more smart-home
          integrations planned for the future.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-4">
          {gallery.map(({ src, alt }) => (
            <Image
              key={src}
              src={src}
              alt={alt}
              width={505}
              height={509}
              className="aspect-square w-full rounded-xl object-cover"
            />
          ))}
        </div>
      </section>

      {/* Beta CTA */}
      <section className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <div className="rounded-2xl border border-border bg-primary-light px-6 py-10 text-center sm:px-12">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface text-primary">
            <IconMail size={20} />
          </div>
          <h2 className="text-lg font-semibold text-text">Want to try Servl first?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
            Servl feeders aren&apos;t available to buy yet. We&apos;re looking for a
            small group of beta testers to try Servl at home and help us shape the
            product before launch. If that&apos;s you, email{' '}
            <a href={BETA_EMAIL_HREF} className="font-medium text-primary hover:underline">
              {BETA_EMAIL}
            </a>{' '}
            to register your interest.
          </p>
          <a href={BETA_EMAIL_HREF} className={`${navButton} mt-6 px-5 py-2.5 text-base bg-primary text-white hover:bg-primary-hover`}>
            Register interest
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-text-tertiary sm:flex-row">
          <p>&copy; {year} Servl. All rights reserved.</p>
          <div className="flex gap-4">
            <Link href="/PrivacyPolicy" className="hover:text-text hover:underline">
              Privacy Policy
            </Link>
            <a href="mailto:contact@servl.uk" className="hover:text-text hover:underline">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
