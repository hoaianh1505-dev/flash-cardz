'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [previewFlipped, setPreviewFlipped] = useState(false);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (tab === 'register' && password !== confirmPassword) {
      setError('Mật khẩu nhập lại không khớp.');
      return;
    }

    setLoading(true);
    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        tab === 'login'
          ? { username: username.trim(), password }
          : { username: username.trim(), displayName: displayName.trim(), password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Có lỗi xảy ra, vui lòng thử lại.');
        setLoading(false);
        return;
      }
      router.refresh();
      window.location.href = '/';
    } catch {
      setError('Không thể kết nối máy chủ.');
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      <button
        type="button"
        className="iconBtn ghost authThemeBtn"
        onClick={toggleTheme}
        title="Đổi giao diện sáng/tối"
        aria-label="Đổi giao diện sáng/tối"
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div className="authShell">
        {/* Left showcase panel */}
        <section className="authHero">
          <div className="authBrand">
            <span className="authBrandDot" />
            FLASHCARDX · TOEIC
          </div>

          <h1 className="authHeroTitle">Học từ vựng TOEIC thông minh &amp; gọn gàng</h1>
          <p className="authHeroDesc">
            Mỗi tài khoản sở hữu bộ thẻ, tiến độ đã thuộc và chuỗi ngày học đồng bộ tự động trên
            đám mây.
          </p>

          {/* Interactive mini preview flashcard */}
          <div
            className={`authMiniCard ${previewFlipped ? 'flipped' : ''}`}
            onClick={() => setPreviewFlipped((f) => !f)}
            title="Bấm để lật thử thẻ"
          >
            <div className="authMiniInner">
              <div className="authMiniFace authMiniFront">
                <span className="authMiniLabel">ENGLISH · Bấm lật thử</span>
                <div className="authMiniWord">Accomplish</div>
                <div className="authMiniMeta">
                  <span className="authMiniPos">v.</span>
                  <span className="authMiniPhon">/əˈkɑːm.plɪʃ/</span>
                </div>
              </div>
              <div className="authMiniFace authMiniBack">
                <span className="authMiniLabel">TIẾNG VIỆT</span>
                <div className="authMiniMeaning">Hoàn thành, thực hiện</div>
                <span className="authMiniTip">✓ Đã thuộc · +1 chuỗi ngày</span>
              </div>
            </div>
          </div>

          <ul className="authFeatures">
            <li>
              <span>📚</span>
              <span>Sẵn 1.000 từ TOEIC cốt lõi cho tài khoản mới</span>
            </li>
            <li>
              <span>🔊</span>
              <span>Phát âm chuẩn, đọc chậm &amp; chế độ trắc nghiệm</span>
            </li>
            <li>
              <span>⚡</span>
              <span>Bảng 360 động từ bất quy tắc &amp; phím tắt siêu nhanh</span>
            </li>
          </ul>
        </section>

        {/* Right form panel */}
        <section className="authPanel">
          <div className="authPanelHead">
            <h2>{tab === 'login' ? 'Chào mừng trở lại' : 'Tạo tài khoản mới'}</h2>
            <p>
              {tab === 'login'
                ? 'Đăng nhập để tiếp tục tiến trình học của bạn.'
                : 'Đăng ký nhanh — nhận ngay bộ 1.000 từ TOEIC cơ bản.'}
            </p>
          </div>

          <div className="authTabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'login'}
              className={`authTab ${tab === 'login' ? 'active' : ''}`}
              onClick={() => {
                setTab('login');
                setError('');
              }}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'register'}
              className={`authTab ${tab === 'register' ? 'active' : ''}`}
              onClick={() => {
                setTab('register');
                setError('');
              }}
            >
              Đăng ký
            </button>
          </div>

          <form className="authForm" onSubmit={handleSubmit}>
            {error && <div className="authError">⚠ {error}</div>}

            <label>
              Tên đăng nhập
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ví dụ: anhpro"
                autoComplete="username"
                required
              />
            </label>

            {tab === 'register' && (
              <label>
                Tên hiển thị <span className="authOpt">(tuỳ chọn)</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: AnhPro"
                  autoComplete="name"
                />
              </label>
            )}

            <label>
              Mật khẩu
              <div className="authPassWrap">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu..."
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  className="authEyeBtn"
                  onClick={() => setShowPass((s) => !s)}
                  tabIndex={-1}
                  title={showPass ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </label>

            {tab === 'register' && (
              <label>
                Nhập lại mật khẩu
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu..."
                  autoComplete="new-password"
                  required
                />
              </label>
            )}

            <button type="submit" className="primary authSubmit" disabled={loading}>
              {loading
                ? tab === 'register'
                  ? 'Đang khởi tạo bộ 1.000 từ TOEIC...'
                  : 'Đang đăng nhập...'
                : tab === 'login'
                  ? 'Đăng nhập ngay →'
                  : 'Tạo tài khoản →'}
            </button>
          </form>

          <p className="authSwitchHint">
            {tab === 'login' ? (
              <>
                Chưa có tài khoản?{' '}
                <button
                  type="button"
                  className="authLinkBtn"
                  onClick={() => {
                    setTab('register');
                    setError('');
                  }}
                >
                  Đăng ký miễn phí
                </button>
              </>
            ) : (
              <>
                Đã có tài khoản?{' '}
                <button
                  type="button"
                  className="authLinkBtn"
                  onClick={() => {
                    setTab('login');
                    setError('');
                  }}
                >
                  Đăng nhập
                </button>
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
