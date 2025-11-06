// ===== MODULE CHẴN LẺ CHO DISCORD BOT =====
// Dựa trên module blackjack nhưng chơi đoán chẵn lẻ
// Cách chơi: Đoán tổng điểm của nhà cái là chẵn hay lẻ

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');

// ===== PHẦN 1: CẤU HÌNH =====
const CONFIG = {
    // Số tiền bắt đầu cho người chơi mới (Lv)
    START_BALANCE: 1000,
    // Thời gian tối đa cho mỗi lượt (mili giây)
    TIMEOUT: 30000,
    // Cược tối thiểu và mặc định
    MIN_BET: 10,
    DEFAULT_BET: 10
};

// ===== PHẦN 2: DỮ LIỆU TRONG RAM =====
// Lưu ý: Dữ liệu sẽ mất khi restart bot
const balances = new Map();
let luckSettings = { player: 'fair', bot: 'fair' };

// ===== PHẦN 3: CÀI ĐẶT MAY MẮN =====
exports.setLuck = function(obj) {
    if (obj && obj.player) luckSettings.player = obj.player;
    if (obj && obj.bot) luckSettings.bot = obj.bot;
};

// ===== PHẦN 4: LOGIC BÀI =====
// Tạo bộ bài mới
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    for (const s of suits)
        for (const r of ranks) deck.push({ r, s });
    return deck.sort(() => Math.random() - 0.5);
}

// Tính điểm một lá
function cardValue(card) {
    if (!card) return 0;
    if (card.r === 'A') return 11;
    if (['K', 'Q', 'J'].includes(card.r)) return 10;
    return parseInt(card.r, 10);
}

// Tính tổng điểm (xử lý A = 1 hoặc 11)
function handValue(cards) {
    let total = 0,
        aces = 0;
    for (const c of cards) {
        if (c.r === 'A') aces++;
        total += cardValue(c);
    }
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

// ===== PHẦN 5: LOGIC MAY MẮN =====
// Điều chỉnh kết quả theo cài đặt may mắn
function adjustDealerHand(deck, desiredOutcome, playerGuess) {
    const MAX_TRIES = 2;
    const dealerCards = [];

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        // Reset và thử lại
        dealerCards.length = 0;
        const tempDeck = [...deck];

        // Rút 2 lá cho dealer
        dealerCards.push(tempDeck.pop(), tempDeck.pop());
        const total = handValue(dealerCards);
        const isEven = total % 2 === 0;

        // Kiểm tra nếu kết quả phù hợp với mong muốn
        if (desiredOutcome === 'playerWin' && isEven === playerGuess) {
            // Người chơi đoán đúng
            deck.splice(-2); // Xóa 2 lá cuối
            return dealerCards;
        } else if (desiredOutcome === 'botWin' && isEven !== playerGuess) {
            // Người chơi đoán sai
            deck.splice(-2);
            return dealerCards;
        }
    }

    // Nếu không tạo được kết quả mong muốn, trả về kết quả ngẫu nhiên
    dealerCards.length = 0;
    dealerCards.push(deck.pop(), deck.pop());
    return dealerCards;
}

// ===== PHẦN 6: XỬ LÝ COMMAND =====
module.exports.name = 'chanle';
module.exports.aliases = ['cl'];
module.exports.prefix = 'lv';

module.exports.execute = async function(message, args) {
    // Kiểm tra cú pháp lệnh
    const cmdArgs = message.content.toLowerCase().split(' ');
    if (cmdArgs[0] !== 'lv' || !['chanle', 'cl'].includes(cmdArgs[1])) {
        return message.reply('Sử dụng: lv chanle <số tiền> chẵn/lẻ');
    }

    const bet = parseInt(cmdArgs[2]);
    const guess = cmdArgs[3];

    if (!bet || bet < CONFIG.MIN_BET) {
        return message.reply(`Cược tối thiểu ${CONFIG.MIN_BET} Lv.`);
    }

    if (!['chan', 'chẵn', 'le', 'lẻ'].includes(guess)) {
        return message.reply('Vui lòng chọn "chẵn" hoặc "lẻ"');
    }

    const userId = message.author.id;
    if (!balances.has(userId)) {
        balances.set(userId, CONFIG.START_BALANCE);
    }

    const balance = balances.get(userId);
    if (bet > balance) {
        return message.reply(`Không đủ Lv! Bạn có ${balance} Lv.`);
    }

    // Xử lý đoán chẵn/lẻ
    const isGuessEven = ['chan', 'chẵn'].includes(guess);
    const deck = createDeck();

    // Áp dụng may mắn
    const luck = luckSettings.player === 'win' ? 'playerWin' :
        luckSettings.bot === 'win' ? 'botWin' :
        'fair';

    // Rút bài cho dealer
    const dealerCards = luck === 'fair' ? [deck.pop(), deck.pop()] :
        adjustDealerHand(deck, luck, isGuessEven);

    const total = handValue(dealerCards);
    const isEven = total % 2 === 0;

    // Tính kết quả
    const won = isGuessEven === isEven;
    const newBalance = won ? balance + bet : balance - bet;
    balances.set(userId, newBalance);

    // Hiển thị kết quả
    const embed = new EmbedBuilder()
        .setTitle('Chẵn Lẻ')
        .setColor(won ? 0x00FF00 : 0xFF0000)
        .addFields({
            name: 'Bài nhà cái',
            value: `${dealerCards.map(c => c.r + c.s).join(' ')} — ${total} điểm (${isEven ? 'Chẵn' : 'Lẻ'})`,
            inline: false
        }, {
            name: 'Kết quả',
            value: `Bạn đoán: ${isGuessEven ? 'Chẵn' : 'Lẻ'}\n${won ? 'Thắng' : 'Thua'} ${bet} Lv!\nSố dư mới: ${newBalance} Lv`,
            inline: false
        });

    await message.reply({ embeds: [embed] });
};