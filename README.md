# Blackjack Bit

Dự án bot Discord tối giản bao gồm lệnh chơi Blackjack và trình khởi chạy bot.

## Trạng thái hiện tại
- Ban đầu repository chỉ có một file `main.js` (trống). Hiện tại đã bao gồm lệnh Blackjack hoàn chỉnh và trình khởi chạy (`launcher.js`) cùng các file hỗ trợ khác.
- Ứng dụng là một bot Discord tối giản sử dụng discord.js v14 với lệnh slash `/blackjack`.

## Tính năng
- Lệnh slash `/blackjack` để bắt đầu ván chơi Blackjack một người với nhà cái (bot).
- Nút bấm tương tác: Rút bài (Hit), Dừng lại (Stand), Gấp đôi (Double).
- Tiền tệ trong bộ nhớ có tên `Lv` (không lưu trữ). Người chơi bắt đầu với số dư mặc định và có thể đặt cược.
- API cấu hình may mắn để điều chỉnh kết quả cho người chơi và nhà cái: `win`, `lose`, hoặc `fair`.
- An toàn: không có vòng lặp vô hạn; giới hạn 2 lần thử khi tạo kết quả có điều chỉnh.
- Bình luận tiếng Việt trong mã nguồn để dễ dàng đọc hiểu.

Lưu ý: Repository này là ví dụ và không lưu trữ số dư - khởi động lại sẽ đặt lại tất cả số dư.

## Cách chạy

Yêu cầu
- Node.js 18+ (Discord.js v14).

Cấu hình
- Tạo bot qua Discord Developer Portal và sao chép token bot.
- Xác định ID guild để test (để đăng ký lệnh slash nhanh hơn) hoặc bỏ qua để đăng ký toàn cầu.

Biến môi trường (ví dụ Windows PowerShell):

```powershell
$env:BOT_TOKEN = "TOKEN_BOT_CỦA_BẠN"
$env:GUILD_ID = "ID_GUILD_TEST" # tùy chọn nhưng khuyến nghị để đăng ký nhanh
npm install
npm start
```

Hoặc tạo file `.env` và chạy với công cụ đọc biến môi trường.

Lệnh
- `/blackjack` — bắt đầu ván Blackjack. Bạn sẽ được yêu cầu đặt cược và sau đó sử dụng các nút: Rút bài, Dừng lại, Gấp đôi.

Cài đặt may mắn
- File lệnh blackjack xuất hàm `setLuck` mà bạn có thể require và gọi từ mã để đặt may mắn cho `player` và `bot`:

```js
const bj = require('./commands/blackjack');
bj.setLuck({ player: 'fair', bot: 'fair' }); // giá trị: 'win' | 'lose' | 'fair'
```

Điều này ảnh hưởng đến thuật toán rút bài. Chương trình sẽ thử tối đa 2 lần để tạo kết quả có điều chỉnh; nếu không thành công sẽ quay lại chơi công bằng.

## File đã thêm
- `package.json` — File manifest của dự án Node và danh sách dependency.
- `launcher.js` — Trình khởi chạy bot và đăng ký lệnh đơn giản. (giữ nguyên `main.js`)
- `commands/blackjack.js` — Triển khai lệnh slash Blackjack với nút bấm và bình luận tiếng Việt.

## Ghi chú & Giới hạn
- Số dư được lưu trong bộ nhớ và sẽ đặt lại khi khởi động lại bot.
- Hệ thống may mắn ảnh hưởng đến kết quả nhưng không đảm bảo; được triển khai để tránh kết quả định sẵn có thể bị lạm dụng.
- Đây là bản demo: kiểm tra và bảo mật token và quyền trước khi chạy trong môi trường sản xuất.

Nếu bạn muốn lưu trữ cố định (SQLite, file JSON, hoặc DB) hoặc bàn chơi nhiều người, hãy cho tôi biết và tôi có thể thêm vào.
