'use client';

import { useEffect, useState } from 'react';
import { ShowCard } from '@/components/show-card';
import { readShowsFromStorage } from '@/lib/local-storage';
import { Show } from '@/lib/types';

export function DashboardClient() {
  const [shows, setShows] = useState<Show[]>([]);

  useEffect(() => {
    setShows(readShowsFromStorage());
  }, []);

  return (
    <div className="grid gap-3">
      {shows.map((show) => (
        <ShowCard key={show.id} show={show} />
      ))}
    </div>
  );
}
