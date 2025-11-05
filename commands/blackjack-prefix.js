// Blackjack command implementation with buttons: Hit, Stand, Double
// Tất cả phần quan trọng đều có comment tiếng Việt.

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
    EmbedBuilder
} = require('discord.js');

// In-memory balances (không persistent)
const balances = new Map();
const START_BALANCE = 1000; // Mỗi người chơi bắt đầu với 1000 Lv nếu chưa có

// Phần cài đặt luck (player, bot): 'win' | 'lose' | 'fair'
let luckSettings = { player: 'fair', bot: 'fair' };

module.exports.setLuck = function(obj) {
    // Hàm để cấu hình luck bên ngoài: module.require(...).setLuck({player:'win', bot:'lose'})
    if (obj ? .player) luckSettings.player = obj.player;
    if (obj ? .bot) luckSettings.bot = obj.bot;
};

// Tạo bộ bài tiêu chuẩn
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    for (const s of suits)
        for (const r of ranks) deck.push({ r, s });
    return deck;
}

function cardValue(card) {
    if (!card) return 0;
    if (card.r === 'A') return 11; // xử lý Ace linh hoạt ở hàm tính tổng
    if (['K', 'Q', 'J'].includes(card.r)) return 10;
    return parseInt(card.r, 10);
}

// Tính giá trị lá bài trong tay, xử lý Ace = 11 hoặc 1
function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
        if (c.r === 'A') aces++;
        total += cardValue(c);
    }
    // Giảm giá trị của Ace từ 11 xuống 1 nếu tổng > 21
    while (total > 21 && aces > 0) {
        total -= 10;
        aces--;
    }
    return total;
}

// Format lá bài để hiển thị
function formatCard(card) {
    return `[${card.r}${card.s}]`;
}

// Format full bài trên tay
function formatHand(cards, hideSecond = false) {
    if (hideSecond) {
        return `${formatCard(cards[0])} [?]`;
    }
    return cards.map(formatCard).join(' ');
}

// Thử tạo kết quả theo luck setting, số lần thử giới hạn = 2
function tryBiasedDraw(deck, hand, target, bias) {
    const attempts = 2; // số lần thử tối đa để tránh vòng lặp
    for (let i = 0; i < attempts; i++) {
        const testDeck = [...deck];
        const testHand = [...hand];
        testHand.push(testDeck.pop());
        const value = handValue(testHand);

        const goodForWin = value >= 17 && value <= 21;
        const goodForLose = value < 17 || value > 21;

        if ((bias === 'win' && goodForWin) || (bias === 'lose' && goodForLose)) {
            deck.pop(); // chấp nhận kết quả, xóa lá này khỏi bộ bài thật
            return testHand[testHand.length - 1];
        }
    }
    return deck.pop(); // nếu không tạo được kết quả mong muốn, chấp nhận kết quả ngẫu nhiên
}

// Kiểm tra prefix và lấy số tiền cược
function parseBet(content) {
    const args = content.split(' ');
    if (args[0].toLowerCase() !== 'lv') return null;
    if (args[1].toLowerCase() !== 'blackjack' && args[1].toLowerCase() !== 'bj') return null;

    const bet = parseInt(args[2]);
    if (isNaN(bet) || bet <= 0) return null;

    return bet;
}

module.exports.name = 'blackjack';
module.exports.aliases = ['bj'];
module.exports.prefix = 'lv';

module.exports.execute = async function(message, args) {
    // Kiểm tra cú pháp lệnh và số tiền cược
    const bet = parseBet(message.content);
    if (!bet) {
        return message.reply('Sử dụng: lv blackjack <số tiền cược>');
    }

    // Kiểm tra và khởi tạo số dư
    if (!balances.has(message.author.id)) {
        balances.set(message.author.id, START_BALANCE);
    }

    const balance = balances.get(message.author.id);
    if (bet > balance) {
        return message.reply(`Bạn không đủ Lv! Số dư hiện tại: ${balance} Lv`);
    }

    // Tạo và shuffle bộ bài
    let deck = createDeck();
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Chia bài ban đầu
    const playerHand = [deck.pop(), deck.pop()];
    const dealerHand = [deck.pop(), deck.pop()];

    // Tạo embed và buttons
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Blackjack')
        .setDescription(`Cược: ${bet} Lv`)
        .addFields({ name: 'Bài của bạn', value: formatHand(playerHand), inline: true }, { name: 'Bài nhà cái', value: formatHand(dealerHand, true), inline: true }, { name: 'Giá trị', value: `${handValue(playerHand)}`, inline: true });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
            .setCustomId('hit')
            .setLabel('Rút bài')
            .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
            .setCustomId('stand')
            .setLabel('Dừng lại')
            .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
            .setCustomId('double')
            .setLabel('Gấp đôi')
            .setStyle(ButtonStyle.Danger)
        );

    const response = await message.reply({ embeds: [embed], components: [row] });

    // Collector cho buttons
    const filter = i => i.user.id === message.author.id;
    const collector = response.createMessageComponentCollector({
        filter,
        componentType: ComponentType.Button,
        time: 60000
    });

    let doubled = false;
    collector.on('collect', async interaction => {
        switch (interaction.customId) {
            case 'hit':
                {
                    // Rút thêm lá và kiểm tra
                    const card = tryBiasedDraw(deck, playerHand, dealerHand, luckSettings.player);
                    playerHand.push(card);
                    const value = handValue(playerHand);

                    embed.setFields({ name: 'Bài của bạn', value: formatHand(playerHand), inline: true }, { name: 'Bài nhà cái', value: formatHand(dealerHand, true), inline: true }, { name: 'Giá trị', value: `${value}`, inline: true });

                    if (value > 21) {
                        // Thua do quá 21
                        embed.setDescription(`Cược: ${bet} Lv\nQuắc! Bạn đã thua ${bet} Lv`);
                        embed.setColor(0xFF0000);
                        balances.set(message.author.id, balance - bet);
                        collector.stop();
                    }

                    await interaction.update({ embeds: [embed], components: value > 21 ? [] : [row] });
                    break;
                }

            case 'stand':
                {
                    // Nhà cái rút bài
                    let dealerValue = handValue(dealerHand);
                    while (dealerValue < 17) {
                        const card = tryBiasedDraw(deck, dealerHand, playerHand, luckSettings.bot);
                        dealerHand.push(card);
                        dealerValue = handValue(dealerHand);
                    }

                    const playerValue = handValue(playerHand);
                    let resultText = '';
                    let color = 0xFFFF00;

                    // Xác định người thắng
                    if (dealerValue > 21) {
                        resultText = `Thắng! Nhà cái quắc. Bạn nhận được ${doubled ? bet * 2 : bet} Lv`;
                        balances.set(message.author.id, balance + (doubled ? bet : bet));
                        color = 0x00FF00;
                    } else if (dealerValue > playerValue) {
                        resultText = `Thua! Bạn mất ${doubled ? bet * 2 : bet} Lv`;
                        balances.set(message.author.id, balance - (doubled ? bet * 2 : bet));
                        color = 0xFF0000;
                    } else if (dealerValue < playerValue) {
                        resultText = `Thắng! Bạn nhận được ${doubled ? bet * 2 : bet} Lv`;
                        balances.set(message.author.id, balance + (doubled ? bet : bet));
                        color = 0x00FF00;
                    } else {
                        resultText = 'Hòa! Không mất tiền cược';
                        color = 0xFFFF00;
                    }

                    embed.setFields({ name: 'Bài của bạn', value: formatHand(playerHand), inline: true }, { name: 'Bài nhà cái', value: formatHand(dealerHand), inline: true }, { name: 'Giá trị', value: `${playerValue} - ${dealerValue}`, inline: true });
                    embed.setDescription(`Cược: ${doubled ? bet * 2 : bet} Lv\n${resultText}`);
                    embed.setColor(color);

                    collector.stop();
                    await interaction.update({ embeds: [embed], components: [] });
                    break;
                }

            case 'double':
                {
                    if (balance < bet * 2) {
                        await interaction.reply({
                            content: 'Không đủ Lv để gấp đôi!',
                            ephemeral: true
                        });
                        return;
                    }

                    doubled = true;
                    const card = tryBiasedDraw(deck, playerHand, dealerHand, luckSettings.player);
                    playerHand.push(card);
                    const value = handValue(playerHand);

                    // Sau khi gấp đôi và rút 1 lá, tự động stand
                    let dealerValue = handValue(dealerHand);
                    while (dealerValue < 17) {
                        const card = tryBiasedDraw(deck, dealerHand, playerHand, luckSettings.bot);
                        dealerHand.push(card);
                        dealerValue = handValue(dealerHand);
                    }

                    let resultText = '';
                    let color = 0xFFFF00;

                    if (value > 21) {
                        resultText = `Quắc! Bạn đã thua ${bet * 2} Lv`;
                        balances.set(message.author.id, balance - bet * 2);
                        color = 0xFF0000;
                    } else if (dealerValue > 21) {
                        resultText = `Thắng! Nhà cái quắc. Bạn nhận được ${bet * 2} Lv`;
                        balances.set(message.author.id, balance + bet * 2);
                        color = 0x00FF00;
                    } else if (dealerValue > value) {
                        resultText = `Thua! Bạn mất ${bet * 2} Lv`;
                        balances.set(message.author.id, balance - bet * 2);
                        color = 0xFF0000;
                    } else if (dealerValue < value) {
                        resultText = `Thắng! Bạn nhận được ${bet * 2} Lv`;
                        balances.set(message.author.id, balance + bet * 2);
                        color = 0x00FF00;
                    } else {
                        resultText = 'Hòa! Không mất tiền cược';
                        color = 0xFFFF00;
                    }

                    embed.setFields({ name: 'Bài của bạn', value: formatHand(playerHand), inline: true }, { name: 'Bài nhà cái', value: formatHand(dealerHand), inline: true }, { name: 'Giá trị', value: `${value} - ${dealerValue}`, inline: true });
                    embed.setDescription(`Cược: ${bet * 2} Lv\n${resultText}`);
                    embed.setColor(color);

                    collector.stop();
                    await interaction.update({ embeds: [embed], components: [] });
                    break;
                }
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            embed.setDescription(`Cược: ${bet} Lv\nHết giờ! Bạn đã thua ${bet} Lv`);
            embed.setColor(0xFF0000);
            balances.set(message.author.id, balance - bet);
            response.edit({ embeds: [embed], components: [] });
        }
    });
};