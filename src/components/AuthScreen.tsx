'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

interface AuthScreenProps {
  onGuestEnter?: () => void;
}

export default function AuthScreen({ onGuestEnter }: AuthScreenProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [previewFlipped, setPreviewFlipped] = useState(false);

  // Top-right toast
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' }>({
    msg: '',
    type: 'info',
  });
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const usernameRef = useRef<HTMLInputElement | null>(null);
  const displayNameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);

  const isRegister = tab === 'register';

  const showToast = useCallback((msg: string, type: 'error' | 'success' | 'info' = 'error') => {
    setToast({ msg, type });
    setToastVisible(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastVisible(false), 3200);
  }, []);

  useEffect(() => {
    const t = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
    setTheme(t);
  }, []);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('toeic_flashcards_theme', next);
    } catch {
      /* ignore */
    }
  }

  function switchTab(next: 'login' | 'register') {
    if (next === tab) return;
    setTab(next);
    setToastVisible(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedUser = username.trim();
    if (!trimmedUser) {
      showToast('Vui lòng nhập tên đăng nhập.', 'error');
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      passwordRef.current?.focus();
      return;
    }
    if (isRegister && !confirmPassword) {
      confirmRef.current?.focus();
      return;
    }
    if (trimmedUser.length < 3) {
      showToast('Tên đăng nhập cần ít nhất 3 ký tự.', 'error');
      usernameRef.current?.focus();
      return;
    }
    if (password.length < 6) {
      showToast('Mật khẩu cần ít nhất 6 ký tự.', 'error');
      passwordRef.current?.focus();
      return;
    }
    if (isRegister && password !== confirmPassword) {
      showToast('Mật khẩu nhập lại không khớp.', 'error');
      confirmRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const payload = isRegister
        ? { username: trimmedUser, displayName: displayName.trim(), password }
        : { username: trimmedUser, password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data?.error || 'Có lỗi xảy ra, vui lòng thử lại.', 'error');
        setLoading(false);
        return;
      }
      showToast(
        isRegister ? 'Tạo tài khoản thành công!' : 'Đăng nhập thành công!',
        'success'
      );
      router.refresh();
      window.location.href = '/';
    } catch {
      showToast('Không thể kết nối máy chủ.', 'error');
      setLoading(false);
    }
  }

  return (
    <main className="authPage">
      <button
        type="button"
        className="iconBtn ghost authThemeBtn"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
        aria-label={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
      >
        {theme === 'dark' ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
        )}
      </button>

      <div className="authShell">
        {/* Left editorial showcase panel */}
        <section className="authHero" aria-label="Giới thiệu FlashcardX">
          <div className="authHeroTop">
            <div className="authBrand">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="5" width="14" height="14" rx="2" />
                <path d="M7 3h12a2 2 0 0 1 2 2v12" />
              </svg>
              <span>FLASHCARDX</span>
            </div>

            <h1 className="authHeroTitle">Học từ vựng TOEIC rõ ràng, bền vững</h1>
            <p className="authHeroDesc">
              Mỗi tài khoản có bộ thẻ riêng, tiến độ đã thuộc và chuỗi ngày học đồng bộ trực tiếp
              trên MongoDB.
            </p>
          </div>

          {/* Interactive sample flashcard */}
          <figure className="authSampleWrap" data-sample="true">
            <button
              type="button"
              className={`authMiniCard ${previewFlipped ? 'flipped' : ''}`}
              onClick={() => setPreviewFlipped((f) => !f)}
              aria-pressed={previewFlipped}
              aria-label="Lật thử thẻ mẫu Accomplish"
            >
              <span className="authMiniInner">
                <span className="authMiniFace authMiniFront">
                  <span className="authMiniLabel">ENGLISH</span>
                  <span className="authMiniWord">Accomplish</span>
                  <span className="authMiniMeta">
                    <span className="authMiniPos">v.</span>
                    <span className="authMiniPhon">/əˈkɑːm.plɪʃ/</span>
                  </span>
                </span>
                <span className="authMiniFace authMiniBack">
                  <span className="authMiniLabel">TIẾNG VIỆT</span>
                  <span className="authMiniMeaning">Hoàn thành, thực hiện</span>
                  <span className="authMiniTip">Đã thuộc</span>
                </span>
              </span>
            </button>
            <figcaption className="authSampleCap">Thẻ mẫu · bấm để lật mặt nghĩa</figcaption>
          </figure>

          <ul className="authFeatures">
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
              </svg>
              <span>Cấp sẵn 1.000 từ TOEIC cơ bản cho tài khoản mới</span>
            </li>
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 5 6 9H3v6h3l5 4z" />
                <path d="M15.5 8.5a5 5 0 0 1 0 7" />
              </svg>
              <span>Phát âm to rõ, đọc chậm và trắc nghiệm 10 câu</span>
            </li>
            <li>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h12" />
              </svg>
              <span>Bảng 100 / 360 động từ bất quy tắc và phím tắt nhanh</span>
            </li>
          </ul>
        </section>

        {/* Right form panel — fixed anchor layout, zero jump between tabs */}
        <section className="authPanel" aria-label="Xác thực tài khoản">
          <div className="authPanelHead">
            <h2>{isRegister ? 'Tạo tài khoản mới' : 'Đăng nhập'}</h2>
            <p>
              {isRegister
                ? 'Tạo tài khoản để nhận bộ 1.000 từ TOEIC cơ bản riêng.'
                : 'Tiếp tục bộ thẻ và tiến độ học của bạn.'}
            </p>
          </div>

          <div className="authTabs" role="tablist" aria-label="Chế độ tài khoản">
            <button
              type="button"
              role="tab"
              aria-selected={!isRegister}
              className={`authTab ${!isRegister ? 'active' : ''}`}
              onClick={() => switchTab('login')}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isRegister}
              className={`authTab ${isRegister ? 'active' : ''}`}
              onClick={() => switchTab('register')}
            >
              Đăng ký
            </button>
          </div>

          <form className="authForm" onSubmit={handleSubmit} noValidate>
            <div className="authField">
              <label htmlFor="auth-username">Tên đăng nhập</label>
              <input
                ref={usernameRef}
                id="auth-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (isRegister && !displayName.trim()) {
                      e.preventDefault();
                      displayNameRef.current?.focus();
                    } else if (!password) {
                      e.preventDefault();
                      passwordRef.current?.focus();
                    }
                  }
                }}
                placeholder="Nhập tên đăng nhập (vd: nguyenvana)"
                autoComplete="username"
                required
              />
            </div>

            {/* Collapsible Register-only field: Display Name */}
            <div className={`authCollapse ${isRegister ? 'open' : ''}`} aria-hidden={!isRegister}>
              <div className="authCollapseInner">
                <div className="authField">
                  <label htmlFor="auth-displayname">
                    Tên hiển thị <span className="authOpt">(tuỳ chọn)</span>
                  </label>
                  <input
                    ref={displayNameRef}
                    id="auth-displayname"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !password) {
                        e.preventDefault();
                        passwordRef.current?.focus();
                      }
                    }}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    autoComplete="name"
                    tabIndex={isRegister ? 0 : -1}
                  />
                </div>
              </div>
            </div>

            <div className="authField">
              <label htmlFor="auth-password">Mật khẩu</label>
              <div className="authPassWrap">
                <input
                  ref={passwordRef}
                  id="auth-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isRegister && !confirmPassword) {
                      e.preventDefault();
                      confirmRef.current?.focus();
                    }
                  }}
                  placeholder="Tối thiểu 6 ký tự"
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="authEyeBtn"
                  onClick={() => setShowPass((s) => !s)}
                  aria-label={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPass ? (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                      <path d="m1 1 22 22" />
                    </svg>
                  ) : (
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Collapsible Register-only field: Confirm Password */}
            <div className={`authCollapse ${isRegister ? 'open' : ''}`} aria-hidden={!isRegister}>
              <div className="authCollapseInner">
                <div className="authField">
                  <label htmlFor="auth-confirm">Nhập lại mật khẩu</label>
                  <input
                    ref={confirmRef}
                    id="auth-confirm"
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu"
                    autoComplete="new-password"
                    tabIndex={isRegister ? 0 : -1}
                    required={isRegister}
                  />
                </div>
              </div>
            </div>

            <button type="submit" className="primary authSubmit" disabled={loading}>
              {loading
                ? isRegister
                  ? 'Đang khởi tạo bộ 1.000 từ TOEIC...'
                  : 'Đang đăng nhập...'
                : isRegister
                  ? 'Tạo tài khoản'
                  : 'Đăng nhập'}
            </button>

            {onGuestEnter && (
              <>
                <div className="authDivider">
                  <span>hoặc</span>
                </div>
                <button
                  type="button"
                  className="ghost authGuestBtn"
                  onClick={onGuestEnter}
                  disabled={loading}
                >
                  Học ngay với Tài khoản khách (Không cần đăng nhập)
                </button>
              </>
            )}
          </form>

          <p className="authSwitchHint">
            {isRegister ? (
              <>
                Đã có tài khoản?{' '}
                <button type="button" className="authLinkBtn" onClick={() => switchTab('login')}>
                  Đăng nhập
                </button>
              </>
            ) : (
              <>
                Chưa có tài khoản?{' '}
                <button type="button" className="authLinkBtn" onClick={() => switchTab('register')}>
                  Đăng ký
                </button>
              </>
            )}
          </p>
        </section>
      </div>

      <div
        role="status"
        aria-live="polite"
        className={`toast toast-${toast.type} ${toastVisible ? 'show' : ''}`}
      >
        {toast.msg}
      </div>
    </main>
  );
}
