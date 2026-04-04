require('dotenv').config();

const fs = require('fs');
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
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REVIEW_CHANNEL_ID = '1490076952122622003';

const DATA_FILE = './data.json';
const DAILY_POINTS = 15;

let data = {
  users: {},
  settings: {
    easy: 10,
    medium: 25,
    hard: 50
  }
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    data = {
      users: existing.users || {},
      settings: {
        easy: existing.settings?.easy ?? 10,
        medium: existing.settings?.medium ?? 25,
        hard: existing.settings?.hard ?? 50
      }
    };
  } catch (err) {
    console.error('Failed to read data.json, starting fresh:', err);
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      epic: null,
      points: 0,
      activeChallenge: null,
      dailyClaimedAt: null,
      completedChallenges: {
        easy: [],
        medium: [],
        hard: []
      },
      stats: {
        approvedChallenges: 0,
        rejectedProofs: 0,
        rerolls: 0,
        dailyClaims: 0
      }
    };
  }

  const user = data.users[userId];

  if (!user.completedChallenges) {
    user.completedChallenges = {
      easy: [],
      medium: [],
      hard: []
    };
  }

  if (typeof user.points !== 'number') {
    user.points = 0;
  }

  if (!('epic' in user)) {
    user.epic = null;
  }

  if (!('activeChallenge' in user)) {
    user.activeChallenge = null;
  }

  if (!('dailyClaimedAt' in user)) {
    user.dailyClaimedAt = null;
  }

  if (!user.stats) {
    user.stats = {
      approvedChallenges: 0,
      rejectedProofs: 0,
      rerolls: 0,
      dailyClaims: 0
    };
  }

  if (typeof user.stats.approvedChallenges !== 'number') {
    user.stats.approvedChallenges = 0;
  }

  if (typeof user.stats.rejectedProofs !== 'number') {
    user.stats.rejectedProofs = 0;
  }

  if (typeof user.stats.rerolls !== 'number') {
    user.stats.rerolls = 0;
  }

  if (typeof user.stats.dailyClaims !== 'number') {
    user.stats.dailyClaims = 0;
  }

  if (user.activeChallenge) {
    if (!('sourceChannelId' in user.activeChallenge)) {
      user.activeChallenge.sourceChannelId = null;
    }

    if (!('sourceMessageId' in user.activeChallenge)) {
      user.activeChallenge.sourceMessageId = null;
    }

    if (!('rerollUsed' in user.activeChallenge)) {
      user.activeChallenge.rerollUsed = false;
    }
  }

  return user;
}

function isStaff(member) {
  return (
    member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
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
    'Win a fight using only AR + shotgun',
    'Use no heals until after your first fight'
  ],
  hard: [
    'Get 5 eliminations',
    'Win a match',
    'No heals the entire game',
    'Only use loot from your first building',
    'Reach top 3 without using shields'
  ]
};

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

function pickChallenge(difficulty, completedList, excludeText = null) {
  const pool = challenges[difficulty] || [];
  const available = pool.filter(
    text => !completedList.includes(text) && text !== excludeText
  );

  if (available.length === 0) return null;

  return available[Math.floor(Math.random() * available.length)];
}

function buildChallengeEmbed(user, challengeObj) {
  const statusMap = {
    active: 'ACTIVE',
    pending: 'PENDING REVIEW',
    approved: 'APPROVED',
    cancelled: 'CANCELLED'
  };

  return new EmbedBuilder()
    .setTitle('🎯 Fortnite Challenge')
    .setColor(
      challengeObj.status === 'approved'
        ? 'Green'
        : challengeObj.status === 'pending'
        ? 'Orange'
        : challengeObj.status === 'cancelled'
        ? 'Red'
        : 'Purple'
    )
    .setDescription(`**${challengeObj.text}**`)
    .addFields(
      { name: 'Difficulty', value: challengeObj.difficulty.toUpperCase(), inline: true },
      { name: 'Epic', value: user.epic || 'Not set', inline: true },
      { name: 'Points', value: `${challengeObj.points}`, inline: true },
      { name: 'Status', value: statusMap[challengeObj.status] || challengeObj.status.toUpperCase(), inline: false }
    )
    .setTimestamp();
}

function buildChallengeButtons(challengeId, pending = false, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`submit_${challengeId}`)
      .setLabel(pending ? 'Proof Submitted' : 'Submit Proof')
      .setStyle(ButtonStyle.Success)
      .setDisabled(pending || disabled),
    new ButtonBuilder()
      .setCustomId(`cancel_${challengeId}`)
      .setLabel('Cancel Challenge')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(pending || disabled)
  );
}

function buildReviewButtons(userId, challengeId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_${userId}_${challengeId}`)
      .setLabel('Approve')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`reject_${userId}_${challengeId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function formatCooldown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

async function getMessageFromStoredLocation(channelId, messageId) {
  if (!channelId || !messageId) return null;

  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.messages) return null;

    const message = await channel.messages.fetch(messageId).catch(() => null);
    return message;
  } catch (err) {
    console.error('Failed to fetch stored message:', err);
    return null;
  }
}

async function updateOriginalChallengeMessage(user, challengeObj, options = {}) {
  if (!challengeObj?.sourceChannelId || !challengeObj?.sourceMessageId) return false;

  try {
    const message = await getMessageFromStoredLocation(
      challengeObj.sourceChannelId,
      challengeObj.sourceMessageId
    );

    if (!message) {
      console.error('Original challenge message not found.');
      return false;
    }

    await message.edit({
      content: options.content ?? '',
      embeds: [buildChallengeEmbed(user, challengeObj)],
      components: options.components ?? [
        buildChallengeButtons(
          challengeObj.id,
          challengeObj.status === 'pending',
          challengeObj.status === 'approved' || challengeObj.status === 'cancelled'
        )
      ]
    });

    return true;
  } catch (err) {
    console.error('Failed to update original challenge message:', err);
    return false;
  }
}

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if the bot is online'),

  new SlashCommandBuilder()
    .setName('rules')
    .setDescription('Show server rules'),

  new SlashCommandBuilder()
    .setName('stormbuddy')
    .setDescription('Show StormBuddy help and commands'),

  new SlashCommandBuilder()
    .setName('lfg')
    .setDescription('Find Fortnite teammates')
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
    .setDescription('Set your Epic username')
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
        .setDescription('Choose challenge difficulty')
        .setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' }
        )
    ),

  new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Reroll your current active challenge once'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily StormBuddy points'),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View your StormBuddy profile or someone else’s')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to view')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the challenge leaderboard'),

  new SlashCommandBuilder()
    .setName('setpoints')
    .setDescription('Change challenge points for a difficulty')
    .addStringOption(option =>
      option
        .setName('difficulty')
        .setDescription('Which difficulty to change')
        .setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('points')
        .setDescription('How many points this difficulty should give')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setuserpoints')
    .setDescription('Set a user’s leaderboard points')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose points you want to set')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('points')
        .setDescription('The exact number of points to set')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('addpoints')
    .setDescription('Add points to a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to give points to')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('How many points to add')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('removepoints')
    .setDescription('Remove points from a user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to remove points from')
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName('amount')
        .setDescription('How many points to remove')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('resetleaderboard')
    .setDescription('Reset all leaderboard points to 0')
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
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
  try {
    if (interaction.isChatInputCommand()) {
      const userId = interaction.user.id;
      const userData = ensureUser(userId);

      if (interaction.commandName === 'ping') {
        await interaction.reply('🏓 Pong!');
        return;
      }

      if (interaction.commandName === 'rules') {
        await interaction.reply('📜 Be respectful. No toxicity. Have fun!');
        return;
      }

      if (interaction.commandName === 'stormbuddy') {
        const embed = new EmbedBuilder()
          .setTitle('⛈️ StormBuddy Commands')
          .setColor('Blurple')
          .setDescription('Here’s what StormBuddy can do right now.')
          .addFields(
            {
              name: 'Player Commands',
              value: [
                '`/setepic` — set your Epic username',
                '`/challenge` — get a challenge',
                '`/reroll` — reroll your active challenge once',
                '`/daily` — claim daily bonus points',
                '`/profile` — view stats',
                '`/leaderboard` — top players',
                '`/lfg` — find teammates'
              ].join('\n')
            },
            {
              name: 'Staff Commands',
              value: [
                '`/setpoints`',
                '`/setuserpoints`',
                '`/addpoints`',
                '`/removepoints`',
                '`/resetleaderboard`'
              ].join('\n')
            }
          )
          .setFooter({ text: `Daily bonus: ${DAILY_POINTS} points` });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        return;
      }

      if (interaction.commandName === 'lfg') {
        const mode = interaction.options.getString('mode');

        const embed = new EmbedBuilder()
          .setTitle('🎮 LFG')
          .setColor('Blue')
          .setDescription(`${interaction.user} is looking for teammates`)
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
        userData.epic = username;
        saveData();

        await interaction.reply(`✅ Your Epic username is now set to **${username}**`);
        return;
      }

      if (interaction.commandName === 'daily') {
        const now = Date.now();
        const lastClaim = userData.dailyClaimedAt || 0;
        const cooldown = 24 * 60 * 60 * 1000;
        const remaining = cooldown - (now - lastClaim);

        if (remaining > 0) {
          await interaction.reply({
            content: `⏳ You already claimed your daily reward. Try again in **${formatCooldown(remaining)}**.`,
            ephemeral: true
          });
          return;
        }

        userData.points += DAILY_POINTS;
        userData.dailyClaimedAt = now;
        userData.stats.dailyClaims += 1;
        saveData();

        await interaction.reply(`🎁 You claimed your daily reward and earned **${DAILY_POINTS}** points! You now have **${userData.points}** points.`);
        return;
      }

      if (interaction.commandName === 'profile') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetData = ensureUser(targetUser.id);

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${targetUser.username}'s StormBuddy Profile`)
          .setColor('Aqua')
          .addFields(
            { name: 'Epic', value: targetData.epic || 'Not set', inline: true },
            { name: 'Points', value: `${targetData.points}`, inline: true },
            { name: 'Active Challenge', value: targetData.activeChallenge ? targetData.activeChallenge.text : 'None', inline: false },
            { name: 'Approved Challenges', value: `${targetData.stats.approvedChallenges}`, inline: true },
            { name: 'Rejected Proofs', value: `${targetData.stats.rejectedProofs}`, inline: true },
            { name: 'Rerolls Used', value: `${targetData.stats.rerolls}`, inline: true },
            { name: 'Daily Claims', value: `${targetData.stats.dailyClaims}`, inline: true },
            {
              name: 'Completed by Difficulty',
              value: `Easy: ${targetData.completedChallenges.easy.length}\nMedium: ${targetData.completedChallenges.medium.length}\nHard: ${targetData.completedChallenges.hard.length}`,
              inline: false
            }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        return;
      }

      if (interaction.commandName === 'setpoints') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const difficulty = interaction.options.getString('difficulty');
        const points = interaction.options.getInteger('points');

        if (points < 1) {
          await interaction.reply({
            content: '❌ Points must be at least 1.',
            ephemeral: true
          });
          return;
        }

        data.settings[difficulty] = points;
        saveData();

        await interaction.reply(`✅ **${difficulty.toUpperCase()}** challenges now give **${points}** points.`);
        return;
      }

      if (interaction.commandName === 'setuserpoints') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const points = interaction.options.getInteger('points');

        if (points < 0) {
          await interaction.reply({
            content: '❌ Points cannot be negative.',
            ephemeral: true
          });
          return;
        }

        const targetUserData = ensureUser(targetUser.id);
        targetUserData.points = points;
        saveData();

        await interaction.reply(`✅ **${targetUser.tag}** now has **${points}** points.`);
        return;
      }

      if (interaction.commandName === 'addpoints') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount < 1) {
          await interaction.reply({
            content: '❌ Amount must be at least 1.',
            ephemeral: true
          });
          return;
        }

        const targetUserData = ensureUser(targetUser.id);
        targetUserData.points += amount;
        saveData();

        await interaction.reply(`✅ Added **${amount}** points to **${targetUser.tag}**.\nNew total: **${targetUserData.points}**`);
        return;
      }

      if (interaction.commandName === 'removepoints') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (amount < 1) {
          await interaction.reply({
            content: '❌ Amount must be at least 1.',
            ephemeral: true
          });
          return;
        }

        const targetUserData = ensureUser(targetUser.id);
        targetUserData.points -= amount;

        if (targetUserData.points < 0) {
          targetUserData.points = 0;
        }

        saveData();

        await interaction.reply(`❌ Removed **${amount}** points from **${targetUser.tag}**.\nNew total: **${targetUserData.points}**`);
        return;
      }

      if (interaction.commandName === 'resetleaderboard') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        for (const id of Object.keys(data.users)) {
          ensureUser(id).points = 0;
        }

        saveData();

        await interaction.reply('✅ The leaderboard has been reset. All user points are now **0**.');
        return;
      }

      if (interaction.commandName === 'challenge') {
        if (!userData.epic) {
          await interaction.reply({
            content: '❌ You must set your Epic first using `/setepic`',
            ephemeral: true
          });
          return;
        }

        if (userData.activeChallenge && ['active', 'pending'].includes(userData.activeChallenge.status)) {
          await interaction.reply({
            content: '❌ You already have an active challenge. Finish it, submit proof, reroll, or cancel it first.',
            ephemeral: true
          });
          return;
        }

        const difficulty = interaction.options.getString('difficulty');
        const completedList = userData.completedChallenges[difficulty] || [];
        const chosenText = pickChallenge(difficulty, completedList);

        if (!chosenText) {
          await interaction.reply(`🏆 You have already completed all **${difficulty}** challenges.`);
          return;
        }

        const challengeObj = {
          id: makeId(),
          difficulty,
          text: chosenText,
          points: data.settings[difficulty],
          status: 'active',
          proofLink: null,
          proofNote: null,
          createdAt: Date.now(),
          sourceChannelId: null,
          sourceMessageId: null,
          rerollUsed: false
        };

        userData.activeChallenge = challengeObj;
        saveData();

        await interaction.reply({
          embeds: [buildChallengeEmbed(userData, challengeObj)],
          components: [buildChallengeButtons(challengeObj.id)]
        });

        const replyMessage = await interaction.fetchReply().catch(() => null);

        if (replyMessage && userData.activeChallenge && userData.activeChallenge.id === challengeObj.id) {
          userData.activeChallenge.sourceChannelId = replyMessage.channelId;
          userData.activeChallenge.sourceMessageId = replyMessage.id;
          saveData();
        }

        return;
      }

      if (interaction.commandName === 'reroll') {
        if (!userData.epic) {
          await interaction.reply({
            content: '❌ You must set your Epic first using `/setepic`',
            ephemeral: true
          });
          return;
        }

        if (!userData.activeChallenge) {
          await interaction.reply({
            content: '❌ You do not have an active challenge to reroll.',
            ephemeral: true
          });
          return;
        }

        if (userData.activeChallenge.status !== 'active') {
          await interaction.reply({
            content: '❌ You can only reroll a challenge while it is active.',
            ephemeral: true
          });
          return;
        }

        if (userData.activeChallenge.rerollUsed) {
          await interaction.reply({
            content: '❌ You already used your reroll on this challenge.',
            ephemeral: true
          });
          return;
        }

        const currentChallenge = userData.activeChallenge;
        const completedList = userData.completedChallenges[currentChallenge.difficulty] || [];
        const newChallengeText = pickChallenge(
          currentChallenge.difficulty,
          completedList,
          currentChallenge.text
        );

        if (!newChallengeText) {
          await interaction.reply({
            content: '❌ No different challenge is available to reroll into.',
            ephemeral: true
          });
          return;
        }

        currentChallenge.text = newChallengeText;
        currentChallenge.rerollUsed = true;
        currentChallenge.createdAt = Date.now();
        currentChallenge.proofLink = null;
        currentChallenge.proofNote = null;
        userData.stats.rerolls += 1;
        saveData();

        await updateOriginalChallengeMessage(userData, currentChallenge, {
          content: '🔄 Challenge rerolled!'
        });

        await interaction.reply({
          content: '🔄 Your challenge was rerolled!',
          embeds: [buildChallengeEmbed(userData, currentChallenge)],
          ephemeral: true
        });

        return;
      }

      if (interaction.commandName === 'leaderboard') {
        const sorted = Object.entries(data.users)
          .sort((a, b) => (b[1].points || 0) - (a[1].points || 0))
          .slice(0, 10);

        if (sorted.length === 0) {
          await interaction.reply('📉 No leaderboard yet.');
          return;
        }

        let desc = '';

        for (let index = 0; index < sorted.length; index++) {
          const [id, user] = sorted[index];
          const discordUser = await client.users.fetch(id).catch(() => null);
          const discordName = discordUser?.username || 'Unknown';
          const epicName = user.epic || 'Not set';

          const medal =
            index === 0 ? '🥇' :
            index === 1 ? '🥈' :
            index === 2 ? '🥉' : '•';

          desc += `${medal} **${index + 1}. ${epicName}** (${discordName}) — ${user.points || 0} pts\n`;
        }

        const embed = new EmbedBuilder()
          .setTitle('🏆 Leaderboard')
          .setColor('Gold')
          .setDescription(desc)
          .setFooter({ text: 'Keep grinding those challenges.' });

        await interaction.reply({ embeds: [embed] });
        return;
      }
    }

    if (interaction.isButton()) {
      const [action, ...parts] = interaction.customId.split('_');

      if (action === 'submit') {
        const challengeId = parts[0];
        const userId = interaction.user.id;
        const userData = ensureUser(userId);

        if (!userData.activeChallenge || userData.activeChallenge.id !== challengeId) {
          await interaction.reply({
            content: '❌ That is not your current challenge.',
            ephemeral: true
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`proofmodal_${challengeId}`)
          .setTitle('Submit Challenge Proof');

        const proofLinkInput = new TextInputBuilder()
          .setCustomId('proof_link')
          .setLabel('Clip or screenshot link')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Paste a Discord, Medal, YouTube, TikTok, or Streamable link');

        const proofNoteInput = new TextInputBuilder()
          .setCustomId('proof_note')
          .setLabel('Short note')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder('Example: 4 kills, top 3, did it in ranked');

        const row1 = new ActionRowBuilder().addComponents(proofLinkInput);
        const row2 = new ActionRowBuilder().addComponents(proofNoteInput);

        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
        return;
      }

      if (action === 'cancel') {
        const challengeId = parts[0];
        const userId = interaction.user.id;
        const userData = ensureUser(userId);

        if (!userData.activeChallenge || userData.activeChallenge.id !== challengeId) {
          await interaction.reply({
            content: '❌ That is not your current challenge.',
            ephemeral: true
          });
          return;
        }

        userData.activeChallenge.status = 'cancelled';
        saveData();

        await updateOriginalChallengeMessage(userData, userData.activeChallenge, {
          content: '❌ Challenge cancelled.',
          components: [buildChallengeButtons(userData.activeChallenge.id, false, true)]
        });

        userData.activeChallenge = null;
        saveData();

        await interaction.update({
          content: '❌ Challenge cancelled.',
          embeds: [],
          components: []
        });
        return;
      }

      if (action === 'approve' || action === 'reject') {
        const modMember = interaction.member;

        if (!isStaff(modMember)) {
          await interaction.reply({
            content: '❌ You need Manage Server or Administrator to do that.',
            ephemeral: true
          });
          return;
        }

        const userId = parts[0];
        const challengeId = parts[1];
        const userData = ensureUser(userId);

        if (!userData.activeChallenge || userData.activeChallenge.id !== challengeId) {
          await interaction.reply({
            content: '❌ That challenge is no longer active.',
            ephemeral: true
          });
          return;
        }

        const targetUser = await client.users.fetch(userId).catch(() => null);

        if (action === 'approve') {
          const challenge = userData.activeChallenge;

          if (!userData.completedChallenges[challenge.difficulty].includes(challenge.text)) {
            userData.completedChallenges[challenge.difficulty].push(challenge.text);
          }

          userData.points += challenge.points;
          userData.stats.approvedChallenges += 1;
          challenge.status = 'approved';
          saveData();

          await updateOriginalChallengeMessage(userData, challenge, {
            content: '✅ Challenge approved and completed!',
            components: [buildChallengeButtons(challenge.id, true, true)]
          });

          userData.activeChallenge = null;
          saveData();

          const approvedEmbed = new EmbedBuilder()
            .setTitle('✅ Challenge Approved')
            .setColor('Green')
            .setDescription(`<@${userId}> completed their challenge and earned **${challenge.points}** points.`)
            .addFields(
              { name: 'Challenge', value: challenge.text, inline: false },
              { name: 'Difficulty', value: challenge.difficulty.toUpperCase(), inline: true },
              { name: 'Epic', value: userData.epic || 'Not set', inline: true }
            )
            .setFooter({ text: `Approved by ${interaction.user.tag}` });

          await interaction.update({
            embeds: [approvedEmbed],
            components: [buildReviewButtons(userId, challengeId, true)]
          });

          if (targetUser) {
            const dmEmbed = new EmbedBuilder()
              .setTitle('✅ Your challenge was approved')
              .setColor('Green')
              .setDescription('Your proof was approved in **Crash & Play Lounge**.')
              .addFields(
                { name: 'Challenge', value: challenge.text, inline: false },
                { name: 'Difficulty', value: challenge.difficulty.toUpperCase(), inline: true },
                { name: 'Points Earned', value: `${challenge.points}`, inline: true },
                { name: 'Total Points', value: `${userData.points}`, inline: true }
              )
              .setFooter({ text: `Approved by ${interaction.user.tag}` })
              .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
          }

          return;
        }

        if (action === 'reject') {
          const rejectedChallenge = {
            text: userData.activeChallenge.text,
            difficulty: userData.activeChallenge.difficulty,
            points: userData.activeChallenge.points
          };

          userData.activeChallenge.status = 'active';
          userData.activeChallenge.proofLink = null;
          userData.activeChallenge.proofNote = null;
          userData.stats.rejectedProofs += 1;
          saveData();

          await updateOriginalChallengeMessage(userData, userData.activeChallenge, {
            content: '❌ Proof rejected. You can submit proof again.',
            components: [buildChallengeButtons(userData.activeChallenge.id, false, false)]
          });

          const rejectedEmbed = new EmbedBuilder()
            .setTitle('❌ Challenge Rejected')
            .setColor('Red')
            .setDescription(`<@${userId}>'s proof was rejected. They can submit proof again.`)
            .addFields(
              { name: 'Challenge', value: userData.activeChallenge.text, inline: false },
              { name: 'Difficulty', value: userData.activeChallenge.difficulty.toUpperCase(), inline: true },
              { name: 'Epic', value: userData.epic || 'Not set', inline: true }
            )
            .setFooter({ text: `Rejected by ${interaction.user.tag}` });

          await interaction.update({
            embeds: [rejectedEmbed],
            components: [buildReviewButtons(userId, challengeId, true)]
          });

          if (targetUser) {
            const dmEmbed = new EmbedBuilder()
              .setTitle('❌ Your challenge proof was rejected')
              .setColor('Red')
              .setDescription('Your proof was rejected in **Crash & Play Lounge**. You can submit proof again.')
              .addFields(
                { name: 'Challenge', value: rejectedChallenge.text, inline: false },
                { name: 'Difficulty', value: rejectedChallenge.difficulty.toUpperCase(), inline: true },
                { name: 'Points', value: `${rejectedChallenge.points}`, inline: true }
              )
              .setFooter({ text: `Rejected by ${interaction.user.tag}` })
              .setTimestamp();

            await targetUser.send({ embeds: [dmEmbed] }).catch(() => null);
          }

          return;
        }
      }
    }

    if (interaction.isModalSubmit()) {
      const [modalType, challengeId] = interaction.customId.split('_');

      if (modalType !== 'proofmodal') return;

      await interaction.deferReply({ ephemeral: true });

      const userId = interaction.user.id;
      const userData = ensureUser(userId);

      if (!userData.activeChallenge || userData.activeChallenge.id !== challengeId) {
        await interaction.editReply({
          content: '❌ That challenge is no longer active.'
        });
        return;
      }

      const proofLink = interaction.fields.getTextInputValue('proof_link');
      const proofNote = interaction.fields.getTextInputValue('proof_note');

      userData.activeChallenge.status = 'pending';
      userData.activeChallenge.proofLink = proofLink;
      userData.activeChallenge.proofNote = proofNote;
      saveData();

      await updateOriginalChallengeMessage(userData, userData.activeChallenge, {
        content: '⏳ Proof submitted. Waiting for staff review.',
        components: [buildChallengeButtons(userData.activeChallenge.id, true, false)]
      });

      let reviewChannel = null;

      try {
        reviewChannel = await client.channels.fetch(REVIEW_CHANNEL_ID);
      } catch (err) {
        console.error('Could not fetch review channel:', err);
      }

      if (!reviewChannel) {
        await interaction.editReply({
          content: '❌ Could not find the review channel. Check the channel ID and bot permissions.'
        });
        return;
      }

      if (
        reviewChannel.type !== ChannelType.GuildText &&
        reviewChannel.type !== ChannelType.PublicThread &&
        reviewChannel.type !== ChannelType.PrivateThread &&
        reviewChannel.type !== ChannelType.AnnouncementThread
      ) {
        await interaction.editReply({
          content: '❌ The review channel is not a normal text channel.'
        });
        return;
      }

      const botMember = await interaction.guild.members.fetchMe();
      const perms = reviewChannel.permissionsFor(botMember);

      if (
        !perms ||
        !perms.has(PermissionsBitField.Flags.ViewChannel) ||
        !perms.has(PermissionsBitField.Flags.SendMessages) ||
        !perms.has(PermissionsBitField.Flags.EmbedLinks)
      ) {
        await interaction.editReply({
          content: '❌ I do not have permission to send messages in the review channel.'
        });
        return;
      }

      const reviewEmbed = new EmbedBuilder()
        .setTitle('📹 Challenge Proof Submitted')
        .setColor('Orange')
        .setDescription(`<@${userId}> submitted proof for review.`)
        .addFields(
          { name: 'Epic', value: userData.epic || 'Not set', inline: true },
          { name: 'Discord', value: interaction.user.tag, inline: true },
          { name: 'Difficulty', value: userData.activeChallenge.difficulty.toUpperCase(), inline: true },
          { name: 'Challenge', value: userData.activeChallenge.text, inline: false },
          { name: 'Proof Link', value: proofLink, inline: false },
          { name: 'Player Note', value: proofNote, inline: false }
        )
        .setTimestamp();

      await reviewChannel.send({
        embeds: [reviewEmbed],
        components: [buildReviewButtons(userId, challengeId)]
      });

      await interaction.editReply({
        content: '✅ Proof submitted successfully! Waiting for mod approval.'
      });
    }
  } catch (err) {
    console.error('Interaction error:', err);

    try {
      if (interaction.deferred) {
        await interaction.editReply({
          content: '❌ Something broke while processing that. Try again.'
        });
      } else if (interaction.replied) {
        await interaction.followUp({
          content: '❌ Something broke while processing that. Try again.',
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: '❌ Something broke while processing that. Try again.',
          ephemeral: true
        });
      }
    } catch (replyErr) {
      console.error('Failed to send error reply:', replyErr);
    }
  }
});

client.login(TOKEN);
