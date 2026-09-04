import LeavePlanner from '@/components/LeavePlanner';
import { DEFAULT_YEAR } from '@/lib/holidays';

export default function HomePage() {
  return <LeavePlanner year={DEFAULT_YEAR} />;
}
