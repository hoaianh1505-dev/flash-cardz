import { getSessionUser } from '@/lib/auth';
import AuthScreen from '@/components/AuthScreen';
import FlashcardApp from '@/components/FlashcardApp';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const session = await getSessionUser();
  if (!session) {
    return <AuthScreen />;
  }
  return <FlashcardApp username={session.displayName} />;
}
