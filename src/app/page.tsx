import { getSessionUser } from '@/lib/auth';
import AppEntry from '@/components/AppEntry';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSessionUser();
  return <AppEntry initialUser={session ? session.displayName : null} />;
}
