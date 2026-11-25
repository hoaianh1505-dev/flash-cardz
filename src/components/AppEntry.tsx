'use client';

import { useEffect, useState } from 'react';
import AuthScreen from './AuthScreen';
import FlashcardApp from './FlashcardApp';

const GUEST_FLAG_KEY = 'flashcardx_guest_mode';

interface Props {
  initialUser: string | null;
}

export default function AppEntry({ initialUser }: Props) {
  const [guestMode, setGuestMode] = useState(false);
  const [checked, setChecked] = useState(Boolean(initialUser));

  useEffect(() => {
    if (initialUser) {
      setChecked(true);
      return;
    }
    try {
      if (localStorage.getItem(GUEST_FLAG_KEY) === '1') {
        setGuestMode(true);
      }
    } catch {
      /* ignore */
    }
    setChecked(true);
  }, [initialUser]);

  const enterGuest = () => {
    try {
      localStorage.setItem(GUEST_FLAG_KEY, '1');
    } catch {
      /* ignore */
    }
    setGuestMode(true);
  };

  const exitGuestToAuth = () => {
    try {
      localStorage.removeItem(GUEST_FLAG_KEY);
    } catch {
      /* ignore */
    }
    setGuestMode(false);
  };

  if (initialUser) {
    return <FlashcardApp username={initialUser} isGuest={false} />;
  }

  if (!checked) {
    return (
      <div className="authWrap">
        <div className="authCard" style={{ textAlign: 'center' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', margin: '0 0 8px' }}>Flashcard TOEIC</h1>
          <p className="note">Đang khởi động...</p>
        </div>
      </div>
    );
  }

  if (guestMode) {
    return <FlashcardApp username="Khách" isGuest={true} onRequestAuth={exitGuestToAuth} />;
  }

  return <AuthScreen onGuestEnter={enterGuest} />;
}
