// Simple bot launcher: đăng ký slash command và khởi động bot
// Yêu cầu trước: set environment variables BOT_TOKEN và GUILD_ID (tùy chọn nhưng khuyến nghị)

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID; // optional, faster registration

if (!TOKEN) {
    console.error('Missing BOT_TOKEN environment variable. Set it before running.');
    process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// Load command modules from commands/ folder
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if (command ? .data) {
            client.commands.set(command.data.name, command);
        }
    }
}

// Register slash commands (guild or global)
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    const cmds = [];
    for (const cmd of client.commands.values()) cmds.push(cmd.data.toJSON ? cmd.data.toJSON() : cmd.data);

    try {
        console.log('Refreshing application (/) commands.');
        if (GUILD_ID) {
            await rest.put(Routes.applicationGuildCommands((await client.application ? .id) || '0', GUILD_ID), { body: cmds });
            console.log('Registered guild commands to', GUILD_ID);
        } else {
            // Register globally (may take up to an hour to propagate)
            await rest.put(Routes.applicationCommands((await client.application ? .id) || '0'), { body: cmds });
            console.log('Registered global commands');
        }
    } catch (err) {
        console.error('Failed to register commands:', err);
    }
}

client.once('ready', async() => {
    console.log(`Logged in as ${client.user.tag}`);
    // Need application id present; ensure client.application is fetched
    await client.application ? .fetch();
    await registerCommands();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction, client);
    } catch (err) {
        console.error('Error executing command:', err);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'Có lỗi xảy ra khi thực thi lệnh.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'Có lỗi xảy ra khi thực thi lệnh.', ephemeral: true });
        }
    }
});

client.login(TOKEN);