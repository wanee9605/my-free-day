import type { MetadataRoute } from 'next';
import { SUPPORTED_YEARS } from '@/lib/holidays';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 },
    ...SUPPORTED_YEARS.map((y) => ({
      url: `${SITE_URL}/${y}`,
      changeFrequency: 'monthly' as const,
      priority: 0.9,
    })),
  ];
}
