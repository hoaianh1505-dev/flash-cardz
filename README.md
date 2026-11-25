# FlashcardX — Flashcard TOEIC (Next.js + MongoDB)

Ứng dụng học từ vựng TOEIC bằng Flashcard hỗ trợ đăng nhập / đăng xuất / đăng ký, mỗi tài khoản sở hữu bộ thẻ và tiến độ học riêng trên MongoDB, sẵn sàng deploy lên Vercel.

## Tính năng
- **Xác thực tài khoản**: Đăng ký, đăng nhập, đăng xuất (JWT lưu trong HTTP-only Cookie, mật khẩu băm `bcryptjs`).
- **Bộ thẻ riêng cho từng người dùng**:
  - Tài khoản mới đăng ký tự động nhận bộ **1.000 từ vựng TOEIC cơ bản**.
  - Tài khoản seed sẵn **`AnhPro`** giữ nguyên toàn bộ 2.071 thẻ và tiến độ đã thuộc/chưa thuộc từ file JSON.
- **Đầy đủ tính năng Flashcard v4.0**: Lật thẻ 3D, phát âm (bình thường & chậm), tự động đọc, lọc theo trạng thái & từ loại, trộn thẻ, tìm nhanh, quản lý A–Z, trắc nghiệm 10 câu, bảng 360 động từ bất quy tắc, chuỗi ngày học, giao diện sáng/tối, sao lưu & phục hồi JSON.

## Cấu hình biến môi trường

Tạo file `.env.local` (hoặc khai báo trên Vercel Dashboard -> Project Settings -> Environment Variables):

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/flashcardX?retryWrites=true&w=majority
JWT_SECRET=<chuoi-bi-mat-ngau-nhien-dai>
```

## Chạy local

```bash
npm install
npm run seed   # Seed tài khoản AnhPro (mật khẩu mặc định: AnhPro123)
npm run dev
```

## Deploy lên Vercel

1. Import repo GitHub này vào Vercel.
2. Thêm 2 biến môi trường `MONGODB_URI` và `JWT_SECRET`.
3. Bấm **Deploy**.
