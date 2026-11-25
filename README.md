# FlashcardX — Flashcard TOEIC (Next.js + MongoDB)

Ứng dụng học từ vựng TOEIC bằng Flashcard hỗ trợ **Tài khoản khách (không cần đăng nhập)** và **Tài khoản đồng bộ Cloud (MongoDB)**, sẵn sàng deploy lên Vercel.

## Tính năng chính
- **Tài khoản khách & Đồng bộ Cloud**: Học ngay không cần đăng nhập (lưu trên trình duyệt), hoặc đăng ký / đăng nhập (JWT HTTP-only Cookie + `bcryptjs`) để đồng bộ bộ thẻ, tiến độ và lịch sử học lên MongoDB.
- **Bộ thẻ 1.000 từ TOEIC cơ bản**: Tự động cấp sẵn cho tài khoản mới đăng ký và chế độ Khách.
- **Học thẻ thông minh**: Lật thẻ 3D, đảo chiều `EN → VI` / `VI → EN`, phát âm to rõ, gắn sao từ quan trọng, ghi chú cá nhân / câu ví dụ, phím tắt nhanh.
- **Phòng luyện tập riêng**:
  - **Nghe chép chính tả từng từ**: Nghe phát âm và gõ lại chính xác, có gợi ý từng chữ và thống kê từ nghe nhầm.
  - **Trắc nghiệm phản xạ**: 4 đáp án (`Anh → Việt` / `Việt → Anh`), chọn nhanh bằng phím `1–4`.
- **Danh sách từ phân trang API**: Lọc server-side theo trạng thái, từ loại, chữ cái `A–Z`, tìm kiếm và phân trang (`25 / 50 / 100` từ/trang).
- **Bảng động từ bất quy tắc**: 100 từ thông dụng & 360 từ đầy đủ, lọc theo quy tắc (`AAA/ABA/ABB/ABC`), chế độ che tự dò và phát âm.
- **Thống kê & Lịch sử luyện tập**: Đặt mục tiêu số từ mỗi ngày, theo dõi chuỗi ngày học, tổng hợp từ hay sai và lịch sử phiên luyện tập (`StudySession`).

## Cấu hình biến môi trường

Tạo file `.env.local` (hoặc khai báo trên Vercel Dashboard -> Project Settings -> Environment Variables):

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/flashcardX?retryWrites=true&w=majority
JWT_SECRET=<chuoi-bi-mat-ngau-nhien-dai>
```

## Chạy local

```bash
npm install
npm run dev
```

## Deploy lên Vercel

1. Import repo GitHub này vào Vercel.
2. Thêm 2 biến môi trường `MONGODB_URI` và `JWT_SECRET`.
3. Bấm **Deploy**.
