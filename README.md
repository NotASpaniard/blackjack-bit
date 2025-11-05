# Blackjack Bit

Minimal project that includes a Discord blackjack command example and a small bot launcher.

## Current state (analysis)
- The repository previously contained a single starter file `main.js` (previously empty). This repo now includes a Blackjack command implementation and a working launcher (`launcher.js`) plus supporting files.
- The app is a minimal Discord bot example using discord.js v14 with a `/blackjack` slash command.

## Features
- Slash command `/blackjack` to start a single-player game of Blackjack against a dealer (bot).
- Interactive buttons for gameplay: Hit, Stand, Double.
- In-memory currency named `Lv` (non-persistent). Players start with a default balance and can place a bet.
- Luck configuration API to bias outcomes for player and dealer: `win`, `lose`, or `fair`.
- Safety: no infinite loops; retry attempts limited to 2 when the code attempts biased outcome crafting.
- Vietnamese comments throughout the implementation for easier localization and understanding.

Note: This repository is an example and does not persist balances — restart will reset all balances.

## How to Run

Requirements
- Node.js 18+ (Discord.js v14).

Configuration
- Create a bot via the Discord Developer Portal and copy the bot token.
- Determine a test guild ID (for quicker slash command registration) or omit to register globally.

Environment variables (Windows PowerShell example):

```powershell
$env:BOT_TOKEN = "YOUR_BOT_TOKEN"
$env:GUILD_ID = "YOUR_TEST_GUILD_ID" # optional but recommended for fast registration
npm install
npm start
```

Alternatively, create a `.env` file and run with a tool that loads env vars.

Commands
- `/blackjack` — starts a blackjack round. You'll be prompted to set a bet and then use the on-screen buttons: Hit, Stand, Double.

Luck settings
- The blackjack command file exports a `setLuck` function you can require and call from code to set luck for `player` and `bot`:

```js
const bj = require('./commands/blackjack');
bj.setLuck({ player: 'fair', bot: 'fair' }); // values: 'win' | 'lose' | 'fair'
```

This biases the underlying draw algorithm. The implementation will attempt at most 2 tries to craft a biased outcome; if unsuccessful it falls back to fair play.

## Files added
- `package.json` — Node project manifest and dependency list.
- `launcher.js` — bot launcher and simple command registration. (keeps original `main.js` untouched)
- `commands/blackjack.js` — Blackjack slash command implementation with buttons and Vietnamese comments.

## Notes & Limitations
- Balances are stored in memory and reset when the bot restarts.
- The luck system biases outcomes but does not guarantee them; it's implemented to avoid abusive deterministic outcomes.
- This is a demo: review and secure tokens and permissions before running in production.

If you'd like persistent storage (SQLite, JSON file, or DB) or multi-player tables, tell me and I can add it.
