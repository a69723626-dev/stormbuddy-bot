require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const challenges = {
  easy: [
    'Only use green weapons or lower.',
    'Land at a named POI and survive for 5 minutes.',
    'Get 1 elimination with an SMG.',
    'Open 5 ammo boxes in one match.',
    'Break 10 structures with your pickaxe.',
    'Use 2 healing items in one game.',
    'Reach top 25 without using a vehicle.',
    'Loot 3 chests before your first fight.',
    'Travel 500 meters on foot only.',
    'Revive or reboot a teammate once.'
  ],
  medium: [
    'Get 3 eliminations in one match.',
    'Use no heals until after your first fight.',
    'Only carry 3 weapons for the whole game.',
    'Reach top 10 while carrying at least 500 wood.',
    'Win a fight using only ARs and shotguns.',
    'Land hot and survive until top 15.',
    'Get an elimination from high ground.',
    'Travel across 3 named POIs in one match.',
    'Use only floor loot for the whole game.',
    'Get 2 eliminations without reloading mid-fight.'
  ],
  hard: [
    'Get 5 eliminations in one match.',
    'No shields allowed for the whole game.',
    'Land at the busiest POI and reach top 5.',
    'Only use loot from your first building.',
    'Win without using medkits or shield pots.',
    'Reach top 3 without sprinting unless forced.',
    'Use only one weapon type for the entire match.',
    'Get an elimination with every weapon slot filled.',
    'Win using only blue weapons or lower.',
    'No healing at all until top 10.'
  ]
};

const difficultyStyles = {
  easy: {
    title: 'Easy Fortnite Challenge',
    color: 0x57F287,
    emoji: '🟢'
  },
  medium: {
    title: 'Medium Fortnite Challenge',
    color: 0xFEE75C,
    emoji: '🟡'
  },
  hard: {
    title: 'Hard Fortnite Challenge',
    color: 0xED4245,
    emoji: '🔴'
  }
};

function getRandomChallenge(difficulty) {
  const list = challenges[difficulty];
  return list[Math.floor(Math.random() * list.length)];
}

function buildChallengeEmbed(difficulty, challenge, username) {
  const style = difficultyStyles[difficulty];

  return new EmbedBuilder()
    .setTitle(`${style.emoji} ${style.title}`)
    .setColor(style.color)
    .setDescription(`**Your challenge:**\n${challenge}`)
    .addFields(
      { name: 'Difficulty', value: difficulty.toUpperCase(), inline: true },
      { name: 'Requested by', value: username, inline: true }
    )
    .setFooter({ text: 'Press reroll for a different challenge' })
    .setTimestamp();
}

function buildChallengeButtons(difficulty) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`reroll_${difficulty}`)
      .setLabel('Reroll Challenge')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`complete_${difficulty}`)
      .setLabel('Completed It')
      .setStyle(ButtonStyle.Success)
  );
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
        .setDescription('Game mode')
        .setRequired(true)
        .addChoices(
          { name: 'Battle Royale', value: 'Battle Royale' },
          { name: 'Zero Build', value: 'Zero Build' },
          { name: 'Ranked', value: 'Ranked' }
        )
    ),

  new SlashCommandBuilder()
    .setName('challenge')
    .setDescription('Get a random Fortnite challenge')
    .addStringOption(option =>
      option.setName('difficulty')
        .setDescription('Choose a difficulty')
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
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') {
      await interaction.reply('Bot is online 🔥');
      return;
    }

    if (interaction.commandName === 'rules') {
      await interaction.reply(
        'Be respectful, no cheating talk, no spam, use correct channels, have fun!'
      );
      return;
    }

    if (interaction.commandName === 'lfg') {
      const mode = interaction.options.getString('mode');

      const embed = new EmbedBuilder()
        .setTitle('🎮 LFG Post')
        .setColor(0x5865F2)
        .addFields(
          { name: 'Mode', value: mode, inline: true },
          { name: 'Host', value: `${interaction.user}`, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (interaction.commandName === 'challenge') {
      const difficulty = interaction.options.getString('difficulty');
      const challenge = getRandomChallenge(difficulty);

      const embed = buildChallengeEmbed(
        difficulty,
        challenge,
        interaction.user.username
      );

      const buttons = buildChallengeButtons(difficulty);

      await interaction.reply({
        embeds: [embed],
        components: [buttons]
      });
      return;
    }
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('reroll_')) {
      const difficulty = interaction.customId.split('_')[1];
      const challenge = getRandomChallenge(difficulty);

      const embed = buildChallengeEmbed(
        difficulty,
        challenge,
        interaction.user.username
      );

      const buttons = buildChallengeButtons(difficulty);

      await interaction.update({
        embeds: [embed],
        components: [buttons]
      });
      return;
    }

    if (interaction.customId.startsWith('complete_')) {
      const difficulty = interaction.customId.split('_')[1];
      const style = difficultyStyles[difficulty];

      await interaction.reply({
        content: `${style.emoji} ${interaction.user} completed a **${difficulty}** challenge!`,
        ephemeral: false
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
