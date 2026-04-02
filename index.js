require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const easyChallenges = [
  'Only use green weapons or lower.',
  'Land at a named POI and survive 5 minutes.',
  'Get 1 elimination with an SMG.',
  'Loot 3 chests before fighting anyone.',
  'Use 2 healing items in one match.',
  'Reach top 25 without using a vehicle.',
  'Break 10 structures with your pickaxe.',
  'Open 5 ammo boxes in one match.'
];

const mediumChallenges = [
  'Win a fight using only shotguns and ARs.',
  'Get 3 eliminations in one match.',
  'Land hot and survive until top 15.',
  'Use no heals until after your first fight.',
  'Only carry 3 weapons for the whole match.',
  'Get an elimination from high ground.',
  'Travel across 3 named POIs in one game.',
  'Reach top 10 while carrying at least 500 wood.'
];

const hardChallenges = [
  'Win using only blue weapons or one weapon type.',
  'Get 5 eliminations in one match.',
  'No shields allowed for the whole game.',
  'Land at the busiest POI and reach top 5.',
  'Only use loot from your first building.',
  'Win without using any medkits or shield pots.',
  'Get an elimination with every weapon slot filled.',
  'Reach top 3 without sprinting unless forced.'
];

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online'),

  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Find Fortnite teammates')
    .addStringOption(option =>
      option.setName('mode')
        .setDescription('Game mode')
        .setRequired(true)
        .addChoices(
          { name: 'Battle Royale', value: 'Battle Royale' },
          { name: 'Zero Build', value: 'Zero Build' },
          { name: 'Ranked', value: 'Ranked' }
        )
    ),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show server rules'),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get a random Fortnite challenge')
    .addStringOption(option =>
      option.setName('difficulty')
        .setDescription('Choose challenge difficulty')
        .setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' }
        )
    )
].map(cmd => cmd.toJSON());

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
  const channel = member.guild.channels.cache.find(c => c.name === 'general-chat');
  if (channel) {
    channel.send(`Welcome ${member} to Crash & Play Lounge! 🎮`);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    await interaction.reply('Bot is online 🔥');
  }

  if (interaction.commandName === 'rules') {
    await interaction.reply(
      'Be respectful, no cheating talk, no spam, use correct channels, have fun!'
    );
  }

  if (interaction.commandName === 'lfg') {
    const mode = interaction.options.getString('mode');
    await interaction.reply(
      `🎮 LFG POST\nMode: ${mode}\nHost: ${interaction.user}`
    );
  }

  if (interaction.commandName === 'challenge') {
    const difficulty = interaction.options.getString('difficulty');
    let selectedChallenge;

    if (difficulty === 'easy') {
      selectedChallenge =
        easyChallenges[Math.floor(Math.random() * easyChallenges.length)];
    }

    if (difficulty === 'medium') {
      selectedChallenge =
        mediumChallenges[Math.floor(Math.random() * mediumChallenges.length)];
    }

    if (difficulty === 'hard') {
      selectedChallenge =
        hardChallenges[Math.floor(Math.random() * hardChallenges.length)];
    }

    await interaction.reply(
      `🎯 **Fortnite Challenge**\nDifficulty: **${difficulty}**\nChallenge: **${selectedChallenge}**`
    );
  }
});

client.login(process.env.DISCORD_TOKEN);
