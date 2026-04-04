require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} = require('discord.js');

const fs = require('fs');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

let data = {};

if (fs.existsSync('data.json')) {
  data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
}

function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(data, null, 2));
}

const challenges = {
  easy: [
    'Get 1 elimination',
    'Open 5 chests',
    'Survive 5 minutes',
    'Use 2 healing items in one match',
    'Break 10 objects with your pickaxe'
  ],
  medium: [
    'Get 3 eliminations',
    'Reach top 10',
    'Travel through 3 POIs',
    'Win a fight using only AR and shotgun',
    'Use no heals until after your first fight'
  ],
  hard: [
    'Get 5 eliminations',
    'Win a match',
    'No heals entire game',
    'Only use loot from your first building',
    'Reach top 3 without using shields'
  ]
};

const pointsMap = {
  easy: 10,
  medium: 25,
  hard: 50
};

function makeChallengeId() {
  return `${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function getRandomChallenge(difficulty, lastCompletedText = null) {
  const list = challenges[difficulty];

  if (!list || list.length === 0) return null;
  if (list.length === 1) return list[0];

  let filtered = list;

  if (lastCompletedText) {
    filtered = list.filter(ch => ch !== lastCompletedText);
    if (filtered.length === 0) filtered = list;
  }

  return filtered[Math.floor(Math.random() * filtered.length)];
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check bot'),

  new SlashCommandBuilder().setName('rules').setDescription('Show rules'),

  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Find teammates')
    .addStringOption(option =>
      option.setName('mode')
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
      option.setName('username').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get challenge')
    .addStringOption(option =>
      option.setName('difficulty')
        .setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' }
        )
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show leaderboard')
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );

  console.log('Commands registered');
}

client.once(Events.ClientReady, async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on(Events.GuildMemberAdd, member => {
  const channel = member.guild.systemChannel;
  if (channel) {
    channel.send(`Welcome ${member} 🎮`);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {
    const userId = interaction.user.id;

    if (!data[userId]) {
      data[userId] = {
        points: 0,
        epic: null,
        active: null,
        activeText: null,
        activeId: null,
        lastCompleted: {
          easy: null,
          medium: null,
          hard: null
        }
      };
    }

    if (interaction.commandName === 'ping') {
      return interaction.reply('Bot is online 🔥');
    }

    if (interaction.commandName === 'rules') {
      return interaction.reply('Be respectful, no spam, have fun.');
    }

    if (interaction.commandName === 'lfg') {
      const mode = interaction.options.getString('mode');

      const embed = new EmbedBuilder()
        .setTitle('🎮 LFG')
        .setDescription(`${interaction.user}`)
        .addFields(
          { name: 'Mode', value: mode },
          { name: 'Host', value: interaction.user.tag }
        );

      return interaction.reply({ embeds: [embed] });
    }

    if (interaction.commandName === 'setepic') {
      const username = interaction.options.getString('username');
      data[userId].epic = username;
      saveData();

      return interaction.reply(`✅ Set to **${username}**`);
    }

    if (interaction.commandName === 'challenge') {
      if (!data[userId].epic) {
        return interaction.reply({
          content: '❌ Use /setepic first',
          ephemeral: true
        });
      }

      const difficulty = interaction.options.getString('difficulty');
      const last = data[userId].lastCompleted[difficulty];

      const challengeText = getRandomChallenge(difficulty, last);
      const id = makeChallengeId();

      data[userId].active = difficulty;
      data[userId].activeText = challengeText;
      data[userId].activeId = id;
      saveData();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_${id}`)
          .setLabel('Mark Complete')
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setTitle('🎯 Fortnite Challenge')
        .setDescription(`**${challengeText}**`)
        .addFields(
          { name: 'Difficulty', value: difficulty.toUpperCase() },
          { name: 'Epic', value: data[userId].epic },
          { name: 'Points', value: `${pointsMap[difficulty]}` }
        );

      return interaction.reply({ embeds: [embed], components: [row] });
    }

    if (interaction.commandName === 'leaderboard') {
      const sorted = Object.entries(data)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 10);

      let text = '🏆 Leaderboard\n\n';

      sorted.forEach((entry, i) => {
        const u = entry[1];
        const discord = client.users.cache.get(entry[0]);

        text += `${i + 1}. ${u.epic} (${discord?.tag}) — ${u.points} pts\n`;
      });

      return interaction.reply(text);
    }
  }

  if (interaction.isButton()) {
    const userId = interaction.user.id;

    if (!data[userId] || !data[userId].activeId) {
      return interaction.reply({
        content: '❌ No active challenge',
        ephemeral: true
      });
    }

    if (interaction.customId !== `complete_${data[userId].activeId}`) {
      return interaction.reply({
        content: '❌ Old button',
        ephemeral: true
      });
    }

    const difficulty = data[userId].active;
    const points = pointsMap[difficulty];

    data[userId].points += points;
    data[userId].lastCompleted[difficulty] = data[userId].activeText;

    data[userId].active = null;
    data[userId].activeText = null;
    data[userId].activeId = null;

    saveData();

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('done')
        .setLabel('Challenge Completed')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );

    return interaction.update({
      content: `🔥 +${points} points`,
      embeds: [],
      components: [disabledRow]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
