// ===== MODULE BLACKJACK CHO DISCORD BOT =====
// Cách sử dụng: Copy toàn bộ file này vào project bot Discord của bạn
// và thêm vào file index/main:
//   const blackjack = require('./blackjack-module.js');
//   // trong phần setup commands:
//   client.commands.set('blackjack', blackjack);

const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');

// ===== PHẦN 1: CẤU HÌNH =====
const CONFIG = {
    // Số tiền bắt đầu cho người chơi mới (Lv)
    START_BALANCE: 1000,
    // Thời gian tối đa cho mỗi lượt (mili giây)
    TIMEOUT: 60000,
    // Cược tối thiểu và mặc định
    MIN_BET: 10,
    DEFAULT_BET: 10
};

// ===== PHẦN 2: DỮ LIỆU TRONG RAM =====
// Lưu ý: Dữ liệu sẽ mất khi restart bot
const balances = new Map();
let luckSettings = { player: 'fair', bot: 'fair' };

// ===== PHẦN 3: CÀI ĐẶT MAY MẮN =====
// Dùng hàm này để điều chỉnh tỉ lệ thắng/thua
// Ví dụ: blackjack.setLuck({ player: 'win', bot: 'fair' });
exports.setLuck = function(obj) {
    if (obj ? .player) luckSettings.player = obj.player;
    if (obj ? .bot) luckSettings.bot = obj.bot;
};

// ===== PHẦN 4: LOGIC BÀI =====
// Tạo bộ bài mới
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    for (const s of suits)
        for (const r of ranks) deck.push({ r, s });
    return deck.sort(() => Math.random() - 0.5); // Xáo bài luôn
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
// Chọn lá phù hợp cho dealer theo chiến lược
function chooseCardForStrategy(deck, dealerCards, playerTotal, strategy) {
    if (strategy === 'neutral' || deck.length === 0) return deck.shift();
    const dealerTotal = handValue(dealerCards);

    // Lọc và xếp thứ tự lá phù hợp
    const candidates = deck.map((c, i) => ({ c, i, v: cardValue(c) }));

    if (strategy === 'makeBust') {
        // Tìm lá làm dealer quá 21
        for (const cand of candidates.sort((a, b) => b.v - a.v)) {
            let temp = dealerTotal + cand.v;
            if (cand.c.r === 'A' && temp > 21) temp -= 10;
            if (temp > 21) return deck.splice(cand.i, 1)[0];
        }
    } else if (strategy === 'makeBeatPlayer') {
        // Tìm lá giúp dealer thắng người chơi
        for (const cand of candidates.sort((a, b) => a.v - b.v)) {
            let temp = dealerTotal + cand.v;
            if (cand.c.r === 'A' && temp > 21) temp -= 10;
            if (temp >= playerTotal && temp <= 21) return deck.splice(cand.i, 1)[0];
        }
    }

    // Nếu không tìm được lá phù hợp, trả về lá đầu
    return deck.shift();
}

// Thử áp dụng may mắn (tối đa 2 lần)
function tryApplyLuck(deck, dealerCards, playerTotal, desiredOutcome) {
    if (desiredOutcome === 'fair') return null;

    const MAX_TRIES = 2;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const simDeck = [...deck];
        const simDealer = [...dealerCards];
        const draws = [];

        while (handValue(simDealer) < 17 && simDeck.length > 0) {
            const strat = desiredOutcome === 'playerWin' ? 'makeBust' : 'makeBeatPlayer';
            const chosen = chooseCardForStrategy(simDeck, simDealer, playerTotal, strat);
            simDealer.push(chosen);
            draws.push(chosen);
        }

        // Kiểm tra kết quả mong muốn
        const dealerVal = handValue(simDealer);
        const success = desiredOutcome === 'playerWin' ?
            dealerVal > 21 || dealerVal < playerTotal :
            dealerVal <= 21 && dealerVal > playerTotal;

        if (success) {
            // Áp dụng các lá đã chọn vào deck thật
            for (const d of draws) {
                const idx = deck.findIndex(x => x.r === d.r && x.s === d.s);
                if (idx >= 0) deck.splice(idx, 1);
            }
            return draws;
        }
    }

    return null; // Không thành công sau 2 lần thử
}

// ===== PHẦN 6: COMMAND SETUP =====
// Định nghĩa lệnh slash command /blackjack
exports.data = new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Chơi blackjack với Lv')
    .addIntegerOption(opt =>
        opt.setName('bet')
        .setDescription('Số Lv muốn đặt (mặc định 10)')
        .setRequired(false)
    );

// ===== PHẦN 7: XỬ LÝ COMMAND =====
exports.execute = async function(interaction) {
    const userId = interaction.user.id;
    const betInput = interaction.options.getInteger('bet') || CONFIG.DEFAULT_BET;

    // Kiểm tra số dư
    if (!balances.has(userId)) balances.set(userId, CONFIG.START_BALANCE);
    const balance = balances.get(userId);

    if (betInput < CONFIG.MIN_BET) {
        return interaction.reply({
            content: `Cược tối thiểu ${CONFIG.MIN_BET} Lv.`,
            ephemeral: true
        });
    }

    if (betInput > balance) {
        return interaction.reply({
            content: `Không đủ Lv. Bạn có ${balance} Lv.`,
            ephemeral: true
        });
    }

    // Khởi tạo ván chơi
    const deck = createDeck();
    const playerCards = [deck.shift(), deck.shift()];
    const dealerCards = [deck.shift(), deck.shift()];
    let doubled = false;

    // Tạo nút bấm
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('hit').setLabel('Rút bài').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
        .setCustomId('stand').setLabel('Dằn bài').setStyle(ButtonStyle.Success),
        new ButtonBuilder()
        .setCustomId('double').setLabel('Gấp đôi').setStyle(ButtonStyle.Secondary)
    );

    // Hiển thị bàn chơi
    const embed = new EmbedBuilder()
        .setTitle('Blackjack')
        .addFields({
            name: 'Bài của bạn',
            value: `${playerCards.map(c => c.r + c.s).join(' ')} — ${handValue(playerCards)} điểm`,
            inline: false
        }, {
            name: 'Bài nhà cái',
            value: `${dealerCards[0].r}${dealerCards[0].s} ?`,
            inline: false
        }, { name: 'Cược', value: `${betInput} Lv`, inline: true }, { name: 'Số dư', value: `${balance} Lv`, inline: true });

    const msg = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true
    });

    // Xử lý nút bấm
    const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: CONFIG.TIMEOUT,
        filter: i => i.user.id === userId
    });

    let gameEnded = false;

    collector.on('collect', async btn => {
        if (gameEnded) return;

        try {
            if (btn.customId === 'hit') {
                playerCards.push(deck.shift());
                const total = handValue(playerCards);

                const newEmbed = EmbedBuilder.from(embed)
                    .spliceFields(0, 1, {
                        name: 'Bài của bạn',
                        value: `${playerCards.map(c => c.r + c.s).join(' ')} — ${total} điểm`,
                        inline: false
                    });

                await btn.update({ embeds: [newEmbed], components: [row] });

                if (total > 21) {
                    gameEnded = true;
                    balances.set(userId, balance - betInput);
                    await btn.followUp(
                        `Bạn quắc ${total} điểm! Thua ${betInput} Lv. Còn ${balances.get(userId)} Lv.`
                    );
                    collector.stop();
                }
            } else if (btn.customId === 'double') {
                if (balance < betInput * 2) {
                    return btn.reply({
                        content: 'Không đủ Lv để gấp đôi.',
                        ephemeral: true
                    });
                }

                doubled = true;
                playerCards.push(deck.shift());
                const total = handValue(playerCards);

                const newEmbed = EmbedBuilder.from(embed)
                    .spliceFields(0, 1, {
                        name: 'Bài của bạn',
                        value: `${playerCards.map(c => c.r + c.s).join(' ')} — ${total} điểm`,
                        inline: false
                    })
                    .spliceFields(2, 1, {
                        name: 'Cược',
                        value: `${betInput * 2} Lv`,
                        inline: true
                    });

                await btn.update({ embeds: [newEmbed], components: [row] });

                if (total > 21) {
                    gameEnded = true;
                    balances.set(userId, balance - betInput * 2);
                    await btn.followUp(
                        `Bạn quắc ${total} điểm! Thua ${betInput * 2} Lv. Còn ${balances.get(userId)} Lv.`
                    );
                    collector.stop();
                    return;
                }

                // Tự động dằn bài sau khi gấp đôi
                await resolveDealer(btn, {
                    deck,
                    playerCards,
                    dealerCards,
                    bet: betInput,
                    doubled,
                    userId
                });
                gameEnded = true;
                collector.stop();
            } else if (btn.customId === 'stand') {
                await resolveDealer(btn, {
                    deck,
                    playerCards,
                    dealerCards,
                    bet: betInput,
                    doubled,
                    userId
                });
                gameEnded = true;
                collector.stop();
            }
        } catch (err) {
            console.error('Lỗi xử lý nút:', err);
            await btn.followUp({
                content: 'Có lỗi xảy ra, thử lại.',
                ephemeral: true
            });
        }
    });

    collector.on('end', collected => {
        if (!gameEnded) {
            interaction.followUp('Hết thời gian chơi.');
        }
    });
};

// ===== PHẦN 8: XỬ LÝ KẾT THÚC VÁN =====
async function resolveDealer(interaction, {
    deck,
    playerCards,
    dealerCards,
    bet,
    doubled,
    userId
}) {
    const playerTotal = handValue(playerCards);
    const effectiveBet = doubled ? bet * 2 : bet;

    // Áp dụng may mắn nếu được cài đặt
    const luck = luckSettings.player === 'win' ? 'playerWin' :
        luckSettings.bot === 'win' ? 'botWin' :
        'fair';

    const luckyDraws = tryApplyLuck(deck, dealerCards, playerTotal, luck);

    // Dealer rút bài
    if (luckyDraws) {
        dealerCards.push(...luckyDraws);
    } else {
        while (handValue(dealerCards) < 17 && deck.length > 0) {
            dealerCards.push(deck.shift());
        }
    }

    const dealerTotal = handValue(dealerCards);
    let resultText = '';
    let payout = 0;

    // Tính kết quả
    if (playerTotal > 21) {
        resultText = `Bạn quắc ${playerTotal}. `;
        payout = -effectiveBet;
    } else if (dealerTotal > 21) {
        resultText = `Nhà cái quắc ${dealerTotal}. `;
        payout = effectiveBet;
    } else if (playerTotal > dealerTotal) {
        resultText = `Bạn ${playerTotal} thắng nhà cái ${dealerTotal}. `;
        payout = effectiveBet;
    } else if (playerTotal < dealerTotal) {
        resultText = `Bạn ${playerTotal} thua nhà cái ${dealerTotal}. `;
        payout = -effectiveBet;
    } else {
        resultText = `Hòa ${playerTotal} điểm. `;
        payout = 0;
    }

    // Cập nhật số dư
    const oldBalance = balances.get(userId);
    const newBalance = oldBalance + payout;
    balances.set(userId, newBalance);

    resultText += payout > 0 ?
        `Thắng ${payout} Lv! ` :
        payout < 0 ?
        `Thua ${-payout} Lv. ` :
        'Không mất Lv. ';

    resultText += `Số dư: ${newBalance} Lv`;

    // Hiển thị kết quả
    const embed = new EmbedBuilder()
        .setTitle('Kết quả Blackjack')
        .addFields({
            name: 'Bài của bạn',
            value: `${playerCards.map(c => c.r + c.s).join(' ')} — ${playerTotal} điểm`,
            inline: false
        }, {
            name: 'Bài nhà cái',
            value: `${dealerCards.map(c => c.r + c.s).join(' ')} — ${dealerTotal} điểm`,
            inline: false
        }, { name: 'Kết quả', value: resultText });

    if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [embed], components: [] });
    } else {
        await interaction.update({ embeds: [embed], components: [] });
    }
}