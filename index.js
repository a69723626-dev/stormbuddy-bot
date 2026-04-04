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
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online'),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show server rules'),

  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Find Fortnite teammates')
    .addStringOption(option =>
      option.setName('mode')
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
    .setDescription('Set your Fortnite username')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Your Epic username')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get a Fortnite challenge')
    .addStringOption(option =>
      option.setName('difficulty')
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
    .setDescription('Show the challenge leaderboard')
].map(command => command.toJSON());

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
  const channel =
    member.guild.channels.cache.find(c => c.name === 'general') ||
    member.guild.channels.cache.find(c => c.name === 'general-chat') ||
    member.guild.systemChannel;

  if (channel) {
    channel.send(`Welcome ${member} to Crash & Play Lounge! 🎮`);
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

    if (!data[userId].lastCompleted) {
      data[userId].lastCompleted = {
        easy: null,
        medium: null,
        hard: null
      };
    }

    if (interaction.commandName === 'ping') {
      await interaction.reply('Bot is online 🔥');
      return;
    }

    if (interaction.commandName === 'rules') {
      await interaction.reply(
        'Be respectful, no cheating talk, no spam, use the correct channels, and have fun.'
      );
      return;
    }

    if (interaction.commandName === 'lfg') {
      const mode = interaction.options.getString('mode');

      const embed = new EmbedBuilder()
        .setTitle('🎮 LFG Post')
        .setDescription(`${interaction.user} is looking for players`)
        .addFields(
          { name: 'Mode', value: mode, inline: true },
          { name: 'Host', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === 'setepic') {
      const username = interaction.options.getString('username');
      data[userId].epic = username;
      saveData();

      await interaction.reply(`✅ Your Epic username is now set to **${username}**`);
      return;
    }

    if (interaction.commandName === 'challenge') {
      if (!data[userId].epic) {
        await interaction.reply({
          content: '❌ You must set your Epic username first using `/setepic`',
          ephemeral: true
        });
        return;
      }

      const difficulty = interaction.options.getString('difficulty');
      const lastCompletedText = data[userId].lastCompleted[difficulty];
      const challengeText = getRandomChallenge(difficulty, lastCompletedText);
      const challengeId = makeChallengeId();

      data[userId].active = difficulty;
      data[userId].activeText = challengeText;
      data[userId].activeId = challengeId;
      saveData();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_${challengeId}`)
          .setLabel('Completed')
          .setStyle(ButtonStyle.Success)
      );

      const embed = new EmbedBuilder()
        .setTitle('🎯 Fortnite Challenge')
        .setDescription(`**${challengeText}**`)
        .addFields(
          { name: 'Difficulty', value: difficulty.toUpperCase(), inline: true },
          { name: 'Epic', value: data[userId].epic, inline: true },
          { name: 'Points', value: `${pointsMap[difficulty]}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        components: [row]
      });
      return;
    }

    if (interaction.commandName === 'leaderboard') {
      const sorted = Object.entries(data)
        .sort((a, b) => b[1].points - a[1].points)
        .slice(0, 10);

      if (sorted.length === 0) {
        await interaction.reply('No leaderboard data yet.');
        return;
      }

      let text = '🏆 **Leaderboard**\n\n';

      sorted.forEach((entry, index) => {
        const userIdFromData = entry[0];
        const userData = entry[1];
        const discordUser = client.users.cache.get(userIdFromData);

        text += `${index + 1}. ${userData.epic || 'Not Set'} (${discordUser?.tag || 'Unknown'}) — ${userData.points} pts\n`;
      });

      await interaction.reply(text);
      return;
    }
  }

  if (interaction.isButton()) {
    const userId = interaction.user.id;

    if (!data[userId] || !data[userId].active || !data[userId].activeId) {
      await interaction.reply({
        content: '❌ You do not have an active challenge.',
        ephemeral: true
      });
      return;
    }

    const expectedButtonId = `complete_${data[userId].activeId}`;

    if (interaction.customId !== expectedButtonId) {
      await interaction.reply({
        content: '❌ That is an old challenge button. Use the button on your current challenge.',
        ephemeral: true
      });
      return;
    }

    const difficulty = data[userId].active;
    const points = pointsMap[difficulty];
    const completedText = data[userId].activeText;

    data[userId].points += points;
    data[userId].lastCompleted[difficulty] = completedText;
    data[userId].active = null;
    data[userId].activeText = null;
    data[userId].activeId = null;
    saveData();

    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('completed_done')
        .setLabel('Completed')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true)
    );

    await interaction.update({
      content: `🔥 ${interaction.user} completed their challenge and earned **${points} points!**`,
      embeds: [],
      components: [disabledRow]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
