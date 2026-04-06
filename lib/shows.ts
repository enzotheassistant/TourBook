import { sampleShows } from '@/lib/sample-data';
import { Show } from '@/lib/types';

export function getSortedSampleShows(): Show[] {
  return [...sampleShows].sort((a, b) => a.date.localeCompare(b.date));
}

export function getSampleShowById(id: string): Show | undefined {
  return sampleShows.find((show) => show.id === id);
}
