// Blackjack command implementation with buttons: Hit, Stand, Double
// Tất cả phần quan trọng đều có comment tiếng Việt.

const { SlashCommandBuilder } = require('@discordjs/builders');
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
    // Giảm Ace từ 11 xuống 1 nếu bị quá 21
    while (total > 21 && aces > 0) {
        total -= 10; // 11 -> 1
        aces -= 1;
    }
    return total;
}

// Lấy và xóa một lá bất kỳ từ deck theo index
function drawAt(deck, index) {
    return deck.splice(index, 1)[0];
}

// Lấy lá đầu (sau khi xáo) hoặc tìm lá phù hợp theo chiến lược
function drawCardDefault(deck) {
    return deck.shift();
}

// Chọn lá phù hợp để ghép outcome theo luck (cố gắng trong tối đa 2 lần)
function chooseCardForStrategy(deck, dealerCards, playerTotal, strategy) {
    // strategy: 'makeBust' | 'makeBeatPlayer' | 'neutral'
    // Không dùng vòng lặp vô hạn, ta chỉ scan deck và chọn 1 lá phù hợp
    if (strategy === 'neutral') return drawCardDefault(deck);

    // Tính total hiện tại của dealer
    const dealerTotal = handValue(dealerCards);

    // Map lá thành giá trị để so sánh
    const candidates = deck.map((c, i) => ({ c, i, v: cardValue(c) }));

    if (strategy === 'makeBust') {
        // tìm lá lớn nhất khiến dealer bust (ưu tiên)
        for (const cand of candidates.sort((a, b) => b.v - a.v)) {
            // Tạm tính nếu thêm cand
            let temp = dealerTotal + cand.v;
            // xử lý Ace tạm thời đơn giản: nếu cand là A và temp>21, điều chỉnh -10
            if (cand.c.r === 'A' && temp > 21) temp -= 10;
            if (temp > 21) return drawAt(deck, cand.i);
        }
        // không tìm thấy, fallback: trả lá lớn nhất
        return drawAt(deck, candidates.sort((a, b) => b.v - a.v)[0].i);
    }

    if (strategy === 'makeBeatPlayer') {
        // tìm lá nhỏ nhất khiến dealer >= playerTotal && <=21
        const sorted = candidates.sort((a, b) => a.v - b.v);
        for (const cand of sorted) {
            let temp = dealerTotal + cand.v;
            if (cand.c.r === 'A' && temp > 21) temp -= 10;
            if (temp >= playerTotal && temp <= 21) return drawAt(deck, cand.i);
        }
        // nếu không có lá phù hợp, chọn lá nhỏ nhất để tránh bust
        return drawAt(deck, sorted[0].i);
    }

    return drawCardDefault(deck);
}

// Hàm nội bộ cố gắng áp dụng luck/bias: tối đa 2 attempts
function applyLuckBias(deck, dealerCards, playerTotal, desiredOutcome) {
    // desiredOutcome: 'playerWin' | 'botWin' | 'fair'
    // Trả về một danh sách các lá dealer sẽ rút (các lá được lấy từ deck theo thứ tự)
    if (desiredOutcome === 'fair') return null; // không can thiệp

    // Số lần thử tối đa
    const MAX_ATTEMPTS = 2;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // clone deck to simulate picks (không thay đổi deck thật nếu simulate thất bại)
        const simDeck = deck.slice();
        const simDealer = dealerCards.slice();
        let draws = [];
        // Simulate dealer drawing until >=17
        while (handValue(simDealer) < 17 && simDeck.length > 0) {
            // chọn chiến lược dựa trên desiredOutcome
            let strat = 'neutral';
            if (desiredOutcome === 'playerWin') strat = 'makeBust';
            else if (desiredOutcome === 'botWin') strat = 'makeBeatPlayer';

            const chosen = chooseCardForStrategy(simDeck, simDealer, playerTotal, strat);
            simDealer.push(chosen);
            draws.push(chosen);
        }

        // Đánh giá kết quả
        const playerVal = playerTotal;
        const dealerVal = handValue(simDealer);
        const playerBust = playerVal > 21;
        const dealerBust = dealerVal > 21;

        const playerWins = (!playerBust && (dealerBust || playerVal > dealerVal)) || (playerVal === 21 && dealerVal !== 21 && !dealerBust);
        const dealerWins = (!dealerBust && (playerBust || dealerVal > playerVal)) || (dealerVal === 21 && playerVal !== 21 && !playerBust);

        if (desiredOutcome === 'playerWin' && playerWins) {
            // apply draws to actual deck: remove the same drawn cards in the same order
            for (const d of draws) {
                const idx = deck.findIndex(x => x.r === d.r && x.s === d.s);
                if (idx >= 0) deck.splice(idx, 1);
            }
            return draws;
        }

        if (desiredOutcome === 'botWin' && dealerWins) {
            for (const d of draws) {
                const idx = deck.findIndex(x => x.r === d.r && x.s === d.s);
                if (idx >= 0) deck.splice(idx, 1);
            }
            return draws;
        }

        // nếu thất bại, thử lại (lần tiếp theo sẽ chọn khác vì we pick from same heuristic but deck not mutated)
    }

    // failed to craft desired outcome within attempts, fallback to null
    return null;
}

module.exports.data = new SlashCommandBuilder()
    .setName('blackjack')
    .setDescription('Chơi blackjack, tiền tệ: Lv')
    .addIntegerOption(opt =>
        opt.setName('bet').setDescription('Số Lv muốn đặt (mặc định 10)').setRequired(false)
    );

module.exports.execute = async function(interaction) {
        // Lấy bet
        const betInput = interaction.options.getInteger('bet') || 10;
        const userId = interaction.user.id;

        // đảm bảo balance có giá trị
        if (!balances.has(userId)) balances.set(userId, START_BALANCE);
        let balance = balances.get(userId);

        if (betInput <= 0) return interaction.reply({ content: 'Số tiền đặt phải lớn hơn 0.', ephemeral: true });
        if (betInput > balance) return interaction.reply({ content: `Bạn không đủ Lv. Hiện có ${balance} Lv.`, ephemeral: true });

        // Chuẩn bị deck và chia
        let deck = createDeck();
        // shuffle đơn giản Fisher-Yates
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        const playerCards = [drawCardDefault(deck), drawCardDefault(deck)];
        const dealerCards = [drawCardDefault(deck), drawCardDefault(deck)];

        let playerTotal = handValue(playerCards);
        let dealerTotalHidden = handValue([dealerCards[0]]); // dealer shows only first card

        // Build embed
        const embed = new EmbedBuilder()
            .setTitle('Blackjack')
            .addFields({ name: 'Bạn', value: `${playerCards.map(c => `${c.r}${c.s}`).join(' ')}  — Tổng: ${playerTotal}`, inline: false },
      { name: 'Dealer (lá úp)', value: `${dealerCards[0].r}${dealerCards[0].s} ?  — Tổng hiển thị: ${dealerTotalHidden}`, inline: false },
      { name: 'Đặt cược', value: `${betInput} Lv`, inline: true },
      { name: 'Số dư', value: `${balance} Lv`, inline: true }
    )
    .setFooter({ text: 'Sử dụng các nút để chơi: Hit, Stand, Double' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('hit').setLabel('Hit').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('stand').setLabel('Stand').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('double').setLabel('Double').setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row] });

  // Collector chỉ chấp nhận người gọi lệnh
  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000, // 60s timeout
    filter: i => i.user.id === interaction.user.id
  });

  let doubled = false;
  let finished = false;

  collector.on('collect', async i => {
    // Ngăn lặp vô hạn: mỗi action xử lý nhanh, và collector auto-stop bằng time hoặc khi finished=true
    if (finished) return i.reply({ content: 'Trò chơi đã kết thúc.', ephemeral: true });

    try {
      if (i.customId === 'hit') {
        // Rút 1 lá
        const card = drawCardDefault(deck);
        playerCards.push(card);
        playerTotal = handValue(playerCards);

        // Cập nhật embed
        const ed = new EmbedBuilder()
          .setTitle('Blackjack')
          .addFields(
            { name: 'Bạn', value: `${playerCards.map(c => `${c.r}${c.s}`).join(' ')}  — Tổng: ${playerTotal}`, inline: false },
            { name: 'Dealer (lá úp)', value: `${dealerCards[0].r}${dealerCards[0].s} ?`, inline: false },
            { name: 'Đặt cược', value: `${betInput} Lv`, inline: true },
            { name: 'Số dư', value: `${balance} Lv`, inline: true }
          );

        await i.update({ embeds: [ed], components: [row] });

        if (playerTotal > 21) {
          // Người chơi bùst
          finished = true;
          balances.set(userId, balance - betInput);
          await i.followUp({ content: `Bạn bị bùst với ${playerTotal}. Thua ${betInput} Lv. Số dư mới: ${balances.get(userId)} Lv`, ephemeral: false });
          collector.stop();
        }
      } else if (i.customId === 'double') {
        // Double: tăng cược gấp đôi, rút đúng 1 lá rồi tự đứng
        if (balance < betInput * 2) {
          await i.reply({ content: 'Bạn không đủ Lv để double.', ephemeral: true });
          return;
        }
        doubled = true;
        // Rút 1 lá
        const card = drawCardDefault(deck);
        playerCards.push(card);
        playerTotal = handValue(playerCards);

        // Cập nhật
        const ed = new EmbedBuilder()
          .setTitle('Blackjack (Double)')
          .addFields(
            { name: 'Bạn', value: `${playerCards.map(c => `${c.r}${c.s}`).join(' ')}  — Tổng: ${playerTotal}`, inline: false },
            { name: 'Dealer (lá úp)', value: `${dealerCards[0].r}${dealerCards[0].s} ?`, inline: false },
            { name: 'Đặt cược', value: `${betInput * 2} Lv`, inline: true },
            { name: 'Số dư', value: `${balance} Lv`, inline: true }
          );

        await i.update({ embeds: [ed], components: [row] });

        // Nếu bùst ngay lập tức
        if (playerTotal > 21) {
          finished = true;
          balances.set(userId, balance - betInput * 2);
          await i.followUp({ content: `Bạn bị bùst với ${playerTotal}. Thua ${betInput * 2} Lv. Số dư mới: ${balances.get(userId)} Lv`, ephemeral: false });
          collector.stop();
          return;
        }

        // Tiếp tục để phần dealer (auto-stand)
        await resolveDealerAndFinish({ interaction: i, deck, playerCards, dealerCards, bet: betInput, doubled, userId });
        finished = true;
        collector.stop();
      } else if (i.customId === 'stand') {
        // Người chơi dừng, dealer chơi
        await i.deferUpdate();
        await resolveDealerAndFinish({ interaction: i, deck, playerCards, dealerCards, bet: betInput, doubled, userId });
        finished = true;
        collector.stop();
      }
    } catch (err) {
      console.error('Interaction handling error:', err);
      // nếu lỗi, cho phép tới 2 lần thử đổi logic (đếm cách đơn giản bằng trường attempts trên interaction?)
      await i.followUp({ content: 'Có lỗi tạm thời. Thử lại lần nữa.', ephemeral: true });
    }
  });

  collector.on('end', collected => {
    if (!finished) {
      // hết thời gian chờ
      interaction.followUp({ content: 'Trò chơi kết thúc do timeout.', ephemeral: true });
    }
  });
};

// Giải quyết lượt của dealer và kết thúc ván
async function resolveDealerAndFinish({ interaction, deck, playerCards, dealerCards, bet, doubled, userId }) {
  // Reveal dealer hole card
  const playerTotal = handValue(playerCards);

  // Áp dụng luck settings nếu có
  const desired = luckSettings.player === 'win' ? 'playerWin' : luckSettings.bot === 'win' ? 'botWin' : 'fair';

  // Thử áp dụng bias; hàm sẽ thay đổi deck nếu thành công
  const applied = applyLuckBias(deck, dealerCards.slice(), playerTotal, desired);

  // Nếu applyLuckBias trả về null => fair hoặc không craft được => chơi mặc định
  // Dealer rút bài theo quy tắc cơ bản (>=17 thì dừng)
  const draws = [];
  while (handValue(dealerCards) < 17 && deck.length > 0) {
    let card;
    if (applied && applied.length > 0) {
      // nếu đã apply, sử dụng lần lượt các lá đã chuẩn bị
      card = applied.shift();
      // nếu lá đó đã bị remove khỏi deck bởi applyLuckBias, nó đã được xóa; nếu không, tìm và xóa
      const idx = deck.findIndex(x => x.r === card.r && x.s === card.s);
      if (idx >= 0) deck.splice(idx, 1);
    } else {
      // lựa chọn mặc định: rút đầu deck
      card = deck.shift();
    }
    dealerCards.push(card);
    draws.push(card);
  }

  const dealerTotal = handValue(dealerCards);
  const playerBust = playerTotal > 21;
  const dealerBust = dealerTotal > 21;

  let resultText = '';
  let payout = 0;
  const effectiveBet = doubled ? bet * 2 : bet;

  if (playerBust) {
    resultText = `Bạn bị bùst (${playerTotal}). Thua ${effectiveBet} Lv.`;
    payout = -effectiveBet;
  } else if (dealerBust) {
    resultText = `Dealer bùst với ${dealerTotal}. Bạn thắng ${effectiveBet} Lv!`;
    payout = effectiveBet;
  } else if (playerTotal > dealerTotal) {
    resultText = `Bạn ${playerTotal} vs Dealer ${dealerTotal}. Bạn thắng ${effectiveBet} Lv!`;
    payout = effectiveBet;
  } else if (playerTotal < dealerTotal) {
    resultText = `Bạn ${playerTotal} vs Dealer ${dealerTotal}. Bạn thua ${effectiveBet} Lv.`;
    payout = -effectiveBet;
  } else {
    resultText = `Hòa: ${playerTotal} vs ${dealerTotal}. Không đổi Lv.`;
    payout = 0;
  }

  // Cập nhật số dư
  const oldBal = balances.get(userId) || START_BALANCE;
  balances.set(userId, oldBal + payout);

  // Gửi kết quả
  const ed = new EmbedBuilder()
    .setTitle('Kết quả Blackjack')
    .addFields(
      { name: 'Bạn', value: `${playerCards.map(c => `${c.r}${c.s}`).join(' ')} — Tổng: ${playerTotal}`, inline: false },
      { name: 'Dealer', value: `${dealerCards.map(c => `${c.r}${c.s}`).join(' ')} — Tổng: ${dealerTotal}`, inline: false },
      { name: 'Kết quả', value: resultText, inline: false },
      { name: 'Số dư mới', value: `${balances.get(userId)} Lv`, inline: true }
    );

  // Nếu interaction là deferUpdate hoặc original reply, gửi followUp để hiện kết quả
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [ed], components: [] });
    } else {
      await interaction.update({ embeds: [ed], components: [] });
    }
  } catch (err) {
    // fallback
    await interaction.reply({ embeds: [ed], components: [] });
  }
}