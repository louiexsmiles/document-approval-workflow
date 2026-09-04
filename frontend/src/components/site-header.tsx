'use client';

import Link from 'next/link';
import { useActingAs } from '@/context/acting-as-context';

export function SiteHeader() {
  const { users, activeUserId, setActiveUserId } = useActingAs();

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200/90 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-3.5">
        <Link
          href="/"
          className="shrink-0 text-xl font-semibold tracking-tight text-stone-900"
        >
          Narratize
        </Link>

        <label className="flex shrink-0 items-center gap-2 text-sm text-stone-500">
          <span className="whitespace-nowrap">Acting as</span>
          <select
            value={activeUserId}
            onChange={(event) => setActiveUserId(event.target.value)}
            className="min-w-[10rem] rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 shadow-sm outline-none transition hover:border-stone-400 focus:border-stone-500 focus:ring-2 focus:ring-stone-900/10"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
