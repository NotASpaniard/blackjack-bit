// ===== MODULE BLACKJACK CHO DISCORD BOT =====
// Cách sử dụng: Copy toàn bộ file này vào project bot Discord của bạn
// và thêm vào file index/main:
//   const blackjack = require('./blackjack-compact.js');
//   // trong phần setup commands:
//   client.commands.set('blackjack', blackjack);

const { SlashCommandBuilder } = require('@discordjs/builders');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, EmbedBuilder } = require('discord.js');

// ===== PHẦN 1: CẤU HÌNH =====
const CONFIG = {
    START_BALANCE: 1000, // Số dư khởi đầu
    TIMEOUT: 60000, // Thời gian chờ tối đa (ms)
    MIN_BET: 1, // Cược tối thiểu
    DEFAULT_BET: 1 // Cược mặc định
};

// ===== PHẦN 2: DỮ LIỆU =====
const balances = new Map();
let luckSettings = { player: 'fair', bot: 'fair' };

// Cài đặt may mắn
exports.setLuck = function(obj) {
    if (obj ? .player) luckSettings.player = obj.player;
    if (obj ? .bot) luckSettings.bot = obj.bot;
};

// ===== PHẦN 3: HỆ THỐNG BÀI =====
// Tạo bộ bài
function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const deck = [];
    for (const s of suits)
        for (const r of ranks) deck.push({ r, s });
    return deck.sort(() => Math.random() - 0.5);
}

// Format hiển thị lá bài
function formatCard(card, hidden = false) {
    return hidden ? '[?]' : `[${card.r}${card.s}]`;
}

// Format cả bộ bài
function formatHand(cards, hideSecond = false) {
    return cards.map((c, i) => formatCard(c, i === 1 && hideSecond)).join('');
}

// Tính điểm
function cardValue(card) {
    if (card.r === 'A') return 11;
    if (['K', 'Q', 'J'].includes(card.r)) return 10;
    return parseInt(card.r, 10);
}

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

// ===== PHẦN 4: XỬ LÝ MAY MẮN =====
function chooseCardForStrategy(deck, dealerCards, playerTotal, strategy) {
    if (strategy === 'neutral' || deck.length === 0) return deck.shift();
    const dealerTotal = handValue(dealerCards);

    const candidates = deck.map((c, i) => ({ c, i, v: cardValue(c) }));

    if (strategy === 'makeBust') {
        for (const cand of candidates.sort((a, b) => b.v - a.v)) {
            let temp = dealerTotal + cand.v;
            if (cand.c.r === 'A' && temp > 21) temp -= 10;
            if (temp > 21) return deck.splice(cand.i, 1)[0];
        }
    } else if (strategy === 'makeBeatPlayer') {
        for (const cand of candidates.sort((a, b) => a.v - b.v)) {
            let temp = dealerTotal + cand.v;
            if (cand.c.r === 'A' && temp > 21) temp -= 10;
            if (temp >= playerTotal && temp <= 21) return deck.splice(cand.i, 1)[0];
        }
    }

    return deck.shift();
}

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

        const dealerVal = handValue(simDealer);
        const success = desiredOutcome === 'playerWin' ?
            dealerVal > 21 || dealerVal < playerTotal :
            dealerVal <= 21 && dealerVal > playerTotal;

        if (success) {
            for (const d of draws) {
                const idx = deck.findIndex(x => x.r === d.r && x.s === d.s);
                if (idx >= 0) deck.splice(idx, 1);
            }
            return draws;
        }
    }

    return null;
}

// ===== PHẦN 5: COMMAND =====
exports.data = new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Chơi blackjack')
    .addIntegerOption(opt =>
        opt.setName('bet')
        .setDescription('Số Lv muốn đặt (mặc định: 1)')
        .setRequired(false)
    );

exports.execute = async function(interaction) {
    const userId = interaction.user.id;
    const betInput = interaction.options.getInteger('bet') || CONFIG.DEFAULT_BET;

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

    const deck = createDeck();
    const playerCards = [deck.shift(), deck.shift()];
    const dealerCards = [deck.shift(), deck.shift()];
    let doubled = false;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
        .setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
        .setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Success),
        new ButtonBuilder()
        .setCustomId('double').setLabel('Double').setStyle(ButtonStyle.Secondary)
    );

    // Create compact embed like OwO
    const embed = new EmbedBuilder()
        .setDescription(
            `${interaction.user.username}, you bet ${betInput} to play blackjack\n\n` +
            `Dealer ${formatHand(dealerCards, true)}\n` +
            `${interaction.user.username} ${formatHand(playerCards)}\n` +
            `Game in progress`
        );

    const msg = await interaction.reply({
        embeds: [embed],
        components: [row],
        fetchReply: true
    });

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

                const newEmbed = new EmbedBuilder()
                    .setDescription(
                        `${interaction.user.username}, you bet ${betInput} to play blackjack\n\n` +
                        `Dealer ${formatHand(dealerCards, true)}\n` +
                        `${interaction.user.username} ${formatHand(playerCards)}\n` +
                        `Game in progress`
                    );

                await btn.update({ embeds: [newEmbed], components: [row] });

                if (total > 21) {
                    gameEnded = true;
                    balances.set(userId, balance - betInput);

                    const bustEmbed = new EmbedBuilder()
                        .setDescription(
                            `${interaction.user.username}, you bet ${betInput} to play blackjack\n\n` +
                            `Dealer ${formatHand(dealerCards, false)}\n` +
                            `${interaction.user.username} ${formatHand(playerCards)}\n` +
                            `Bust! You lost ${betInput} Lv`
                        );

                    await btn.editReply({ embeds: [bustEmbed], components: [] });
                    collector.stop();
                }
            } else if (btn.customId === 'double') {
                if (balance < betInput * 2) {
                    return btn.reply({
                        content: 'Không đủ Lv để double.',
                        ephemeral: true
                    });
                }

                doubled = true;
                playerCards.push(deck.shift());
                const total = handValue(playerCards);

                if (total > 21) {
                    gameEnded = true;
                    balances.set(userId, balance - betInput * 2);

                    const bustEmbed = new EmbedBuilder()
                        .setDescription(
                            `${interaction.user.username}, you bet ${betInput * 2} to play blackjack\n\n` +
                            `Dealer ${formatHand(dealerCards, false)}\n` +
                            `${interaction.user.username} ${formatHand(playerCards)}\n` +
                            `Bust! You lost ${betInput * 2} Lv`
                        );

                    await btn.update({ embeds: [bustEmbed], components: [] });
                    collector.stop();
                    return;
                }

                await resolveDealer(btn, {
                    interaction,
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
                    interaction,
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
            console.error('Button error:', err);
            await btn.followUp({
                content: 'An error occurred.',
                ephemeral: true
            });
        }
    });

    collector.on('end', collected => {
        if (!gameEnded) {
            const timeoutEmbed = new EmbedBuilder()
                .setDescription(
                    `${interaction.user.username}, you bet ${betInput} to play blackjack\n\n` +
                    `Dealer ${formatHand(dealerCards, false)}\n` +
                    `${interaction.user.username} ${formatHand(playerCards)}\n` +
                    `Game expired`
                );

            interaction.editReply({
                embeds: [timeoutEmbed],
                components: []
            });
        }
    });
};

// ===== PHẦN 6: KẾT THÚC GAME =====
async function resolveDealer(btn, {
    interaction,
    deck,
    playerCards,
    dealerCards,
    bet,
    doubled,
    userId
}) {
    const playerTotal = handValue(playerCards);
    const effectiveBet = doubled ? bet * 2 : bet;

    const luck = luckSettings.player === 'win' ? 'playerWin' :
        luckSettings.bot === 'win' ? 'botWin' :
        'fair';

    const luckyDraws = tryApplyLuck(deck, dealerCards, playerTotal, luck);

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

    if (playerTotal > 21) {
        resultText = `Bust! You lost ${effectiveBet} Lv`;
        payout = -effectiveBet;
    } else if (dealerTotal > 21) {
        resultText = `Dealer bust! You won ${effectiveBet} Lv`;
        payout = effectiveBet;
    } else if (playerTotal > dealerTotal) {
        resultText = `You won ${effectiveBet} Lv!`;
        payout = effectiveBet;
    } else if (playerTotal < dealerTotal) {
        resultText = `You lost ${effectiveBet} Lv`;
        payout = -effectiveBet;
    } else {
        resultText = `It's a tie!`;
        payout = 0;
    }

    const oldBalance = balances.get(userId);
    balances.set(userId, oldBalance + payout);

    const finalEmbed = new EmbedBuilder()
        .setDescription(
            `${interaction.user.username}, you bet ${effectiveBet} to play blackjack\n\n` +
            `Dealer ${formatHand(dealerCards, false)}\n` +
            `${interaction.user.username} ${formatHand(playerCards)}\n` +
            resultText
        );

    await btn.update({
        embeds: [finalEmbed],
        components: []
    });
}