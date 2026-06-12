import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import {
  IconBellRinging,
  IconBrandGoogle,
  IconCalendarTime,
  IconUsers,
} from '@tabler/icons-react';

export const metadata: Metadata = {
  title: 'Servl — Smart Pet Feeder',
  description:
    'Servl is a Wi-Fi connected automatic pet feeder with an Android app, web dashboard, and Google Home voice control.',
};

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
  { src: '/images/gallery-cat-1.png', alt: 'A tabby cat in a bright, minimalist hallway' },
  { src: '/images/gallery-dog-2.png', alt: 'A poodle puppy sitting in a calm dining room' },
  { src: '/images/gallery-cat-3.png', alt: 'A tabby cat sitting on a woven rug' },
];

const navButton = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-bg">
      {/* Nav */}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <img src="/servl-logo-banner.svg" alt="Servl" className="h-7 w-auto" />
          <div className="flex items-center gap-2">
            <Link href="/login" className={`${navButton} border border-border-strong text-text hover:bg-border`}>
              Log in
            </Link>
            <Link href="/register" className={`${navButton} bg-primary text-white hover:bg-primary-hover`}>
              Sign up
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-16 sm:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="text-center lg:text-left">
            <img src="/servl-logo.svg" alt="Servl" width={120} className="mx-auto mb-6 lg:mx-0" />
            <h1 className="text-3xl font-semibold text-text sm:text-4xl">
              Automated feeding for happier pets
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-text-secondary lg:mx-0">
              Servl is a Wi-Fi connected pet feeder that dispenses precise portions of
              dry food on schedule, on demand from the app, or with a simple voice
              command.
            </p>
            <div className="mt-8 flex justify-center gap-3 lg:justify-start">
              <Link href="/register" className={`${navButton} px-5 py-2.5 text-base bg-primary text-white hover:bg-primary-hover`}>
                Get started
              </Link>
              <Link href="/login" className={`${navButton} px-5 py-2.5 text-base border border-border-strong text-text hover:bg-border`}>
                Log in
              </Link>
            </div>
          </div>
          <div className="order-first lg:order-last">
            <Image
              src="/images/hero-pet.png"
              alt="A grey cat sitting on a windowsill in a bright, minimalist room"
              width={510}
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
