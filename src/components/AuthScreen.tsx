'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
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
    <div className="authWrap">
      <div className="authCard">
        <h1>Flashcard TOEIC</h1>
        <p className="authSub">Học từ vựng TOEIC · Lưu tiến độ riêng theo tài khoản</p>

        <div className="authTabs">
          <button
            type="button"
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
          {error && <div className="authError">{error}</div>}

          <label>
            Tên đăng nhập
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ví dụ: AnhPro"
              autoComplete="username"
              required
            />
          </label>

          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu..."
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>

          {tab === 'register' && (
            <label>
              Nhập lại mật khẩu
              <input
                type="password"
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
                ? 'Đang tạo bộ thẻ 1000 từ TOEIC...'
                : 'Đang đăng nhập...'
              : tab === 'login'
                ? 'Đăng nhập'
                : 'Tạo tài khoản mới'}
          </button>
        </form>

        <div className="authNote">
          {tab === 'register' ? (
            <>
              ✨ Tài khoản mới sẽ được cấp sẵn bộ <b>1.000 từ vựng TOEIC cơ bản</b> riêng biệt để
              bạn tự học, thêm từ và theo dõi tiến độ.
            </>
          ) : (
            <>
              📚 Mỗi tài khoản có bộ flashcard, tiến độ đã thuộc và chuỗi ngày học lưu riêng trên
              MongoDB — học mọi lúc, mọi thiết bị.
            </>
          )}
        </div>
      </div>
    </div>
  );
}
