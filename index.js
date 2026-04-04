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

let users = {};

const challenges = {
  easy: [
    { text: 'Get 1 elimination', points: 10 },
    { text: 'Open 5 chests', points: 10 },
    { text: 'Survive 5 minutes', points: 10 },
    { text: 'Use 2 healing items in one match', points: 10 },
    { text: 'Break 10 objects with your pickaxe', points: 10 }
  ],
  medium: [
    { text: 'Win a fight using only AR + shotgun', points: 25 },
    { text: 'Get 5 eliminations', points: 25 },
    { text: 'Reach top 10', points: 25 },
    { text: 'Travel through 3 POIs', points: 25 },
    { text: 'Use no heals until after your first fight', points: 25 }
  ],
  hard: [
    { text: 'Win the game', points: 50 },
    { text: 'Get 10 eliminations in one match', points: 50 },
    { text: 'No heals entire game', points: 50 },
    { text: 'Only use loot from your first building', points: 50 },
    { text: 'Reach top 3 without using shields', points: 50 }
  ]
};

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

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName, user } = interaction;

    if (commandName === 'ping') {
      return interaction.reply('🏓 Pong!');
    }

    if (commandName === 'rules') {
      return interaction.reply('📜 Be respectful. No toxicity. Have fun!');
    }

    if (commandName === 'lfg') {
      const mode = interaction.options.getString('mode');
      return interaction.reply(`🎮 ${user.username} is looking for teammates in **${mode}**!`);
    }

    if (commandName === 'setepic') {
      const username = interaction.options.getString('username');

      if (!users[user.id]) {
        users[user.id] = { epic: '', points: 0, activeChallenges: {}, completed: [] };
      }

      users[user.id].epic = username;

      return interaction.reply(`✅ Your Epic username is now set to **${username}**`);
    }

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

      if (!users[user.id].completed) {
        users[user.id].completed = [];
      }

      const completed = users[user.id].completed;

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
          .setLabel('Mark Complete')
          .setStyle(ButtonStyle.Success)
      );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (commandName === 'leaderboard') {
      const sorted = Object.entries(users)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 10);

      if (sorted.length === 0) {
        return interaction.reply('📉 No leaderboard yet.');
      }

      let desc = '';

      sorted.forEach(([id, data], i) => {
        const discordName = client.users.cache.get(id)?.username || 'Unknown';
        desc += `**${i + 1}. ${data.epic}** (${discordName}) — ${data.points} pts\n`;
      });

      const embed = new EmbedBuilder()
        .setTitle('🏆 Leaderboard')
        .setDescription(desc)
        .setColor('Gold');

      return interaction.reply({ embeds: [embed] });
    }
  }

  if (interaction.isButton()) {
    const userId = interaction.user.id;
    const difficulty = interaction.customId.split('_')[1];
    const userData = users[userId];

    if (!userData || !userData.activeChallenges || !userData.activeChallenges[difficulty]) {
      return interaction.reply({
        content: '❌ No active challenge.',
        ephemeral: true
      });
    }

    const challenge = userData.activeChallenges[difficulty];

    if (!userData.completed) {
      userData.completed = [];
    }

    if (!userData.completed.includes(challenge.text)) {
      userData.completed.push(challenge.text);
      userData.points += challenge.points;
    }

    delete userData.activeChallenges[difficulty];

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('done')
        .setLabel('Challenge Completed')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );

    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Challenge Completed')
          .setDescription(`You earned **${challenge.points}** points for:\n${challenge.text}`)
          .setColor('Green')
      ],
      components: [disabledRow]
    });
  }
});

client.login(TOKEN);
