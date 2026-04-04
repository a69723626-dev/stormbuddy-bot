require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

let users = {}; // stores epic + points + challenges

// 🎯 CHALLENGES
const challenges = {
  easy: [
    { text: "Get 1 elimination", points: 10 },
    { text: "Open 5 chests", points: 10 }
  ],
  medium: [
    { text: "Win a fight using only AR + shotgun", points: 25 },
    { text: "Get 5 eliminations", points: 25 }
  ],
  hard: [
    { text: "Win the game", points: 50 },
    { text: "Get 10 eliminations in one match", points: 50 }
  ]
};

// 🔧 COMMANDS
const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot'),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show rules'),

  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Find teammates')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('Choose a mode')
        .setRequired(true)
        .addChoices(
          { name: 'Battle Royale', value: 'Battle Royale' },
          { name: 'Zero Build', value: 'Zero Build' },
          { name: 'Ranked', value: 'Ranked' }
        )
    ),

  new SlashCommandBuilder()
    .setName('setepic')
    .setDescription('Set Epic username')
    .addStringOption(option =>
      option
        .setName('username')
        .setDescription('Your Epic username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get a Fortnite challenge')
    .addStringOption(option =>
      option
        .setName('difficulty')
        .setDescription('Choose difficulty')
        .setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' }
        )
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('View leaderboard')
].map(c => c.toJSON());

// 🚀 REGISTER COMMANDS
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log('Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Commands registered!');
  } catch (err) {
    console.error(err);
  }
})();

// 🎮 BOT READY
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// 🎯 INTERACTIONS
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, user } = interaction;

    // 🔹 PING
    if (commandName === 'ping') {
      return interaction.reply('🏓 Pong!');
    }

    // 🔹 RULES
    if (commandName === 'rules') {
      return interaction.reply('📜 Be respectful. No toxicity. Have fun!');
    }

    // 🔹 LFG
    if (commandName === 'lfg') {
      const mode = interaction.options.getString('mode');
      return interaction.reply(`🎮 ${user.username} is looking for teammates in **${mode}**!`);
    }

    // 🔹 SET EPIC
    if (commandName === 'setepic') {
      const username = interaction.options.getString('username');

      if (!users[user.id]) {
        users[user.id] = { epic: "", points: 0, activeChallenges: {} };
      }

      users[user.id].epic = username;

      return interaction.reply(`✅ Your Epic username is now set to **${username}**`);
    }

    // 🔹 CHALLENGE
    if (commandName === 'challenge') {
      const difficulty = interaction.options.getString('difficulty');

      if (!users[user.id] || !users[user.id].epic) {
        return interaction.reply({
          content: '❌ You must link your Epic first using `/setepic`',
          ephemeral: true
        });
      }

      if (!users[user.id].activeChallenges) {
        users[user.id].activeChallenges = {};
      }

      const completed = users[user.id].completed || [];

      // pick a NEW challenge not completed
      const available = challenges[difficulty].filter(
        c => !completed.includes(c.text)
      );

      if (available.length === 0) {
        return interaction.reply("🏆 You've completed all challenges in this difficulty!");
      }

      const challenge = available[Math.floor(Math.random() * available.length)];

      users[user.id].activeChallenges[difficulty] = challenge;

      const embed = new EmbedBuilder()
        .setTitle('🎯 Fortnite Challenge')
        .setDescription(challenge.text)
        .addFields(
          { name: 'Difficulty', value: difficulty.toUpperCase(), inline: true },
          { name: 'Epic', value: users[user.id].epic, inline: true },
          { name: 'Points', value: `${challenge.points}`, inline: true }
        )
        .setColor('Purple');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_${difficulty}`)
          .setLabel('Completed')
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    // 🔹 LEADERBOARD
    if (commandName === 'leaderboard') {
      const sorted = Object.entries(users)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 10);

      if (sorted.length === 0) {
        return interaction.reply("📉 No leaderboard yet.");
      }

      let desc = "";

      sorted.forEach(([id, data], i) => {
        desc += `**${i + 1}. ${data.epic}** (${client.users.cache.get(id)?.username || "Unknown"}) — ${data.points} pts\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🏆 Leaderboard')
        .setDescription(desc)
        .setColor('Gold');

      return interaction.reply({ embeds: [embed] });
    }
  }

  // 🔘 BUTTON CLICK
  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const difficulty = interaction.customId.split('_')[1];

    const userData = users[userId];

    if (!userData || !userData.activeChallenges[difficulty]) {
      return interaction.reply({ content: "❌ No active challenge.", ephemeral: true });
    }

    const challenge = userData.activeChallenges[difficulty];

    if (!userData.completed) userData.completed = [];

    if (!userData.completed.includes(challenge.text)) {
      userData.completed.push(challenge.text);
      userData.points += challenge.points;
    }

    delete userData.activeChallenges[difficulty];

    return interaction.update({
      content: `✅ Challenge completed! +${challenge.points} points`,
      embeds: [],
      components: []
    });
  }
});

// 🔐 LOGIN
client.login(TOKEN);
