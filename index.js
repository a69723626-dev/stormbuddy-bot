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
  ChannelType,
  Partials
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const REVIEW_CHANNEL_ID = '1490076952122622003';
const PURCHASES_CHANNEL_ID = '1490394016250859691';

const DATA_FILE = './data.json';
const DAILY_POINTS = 15;
const DUEL_POINTS = {
  easy: 15,
  medium: 35,
  hard: 75
};

let data = {
  users: {},
  duels: {},
  giveaways: {},
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
      duels: existing.duels || {},
      giveaways: existing.giveaways || {},
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

async function isValidEpicUsername(username) {
  try {
    const cleaned = username.trim();

    if (cleaned.length < 3 || cleaned.length > 16) {
      return false;
    }

    const response = await fetch(
      `https://fortnite-api.com/v2/stats/br/v2?name=${encodeURIComponent(cleaned)}`
    );

    const data = await response.json();

    if (!data || data.status !== 200 || !data.data || !data.data.account || !data.data.account.name) {
      return false;
    }

    return data.data.account.name.toLowerCase() === cleaned.toLowerCase();
  } catch (err) {
    return false;
  }
}

function ensureUser(userId) {
  if (!data.users[userId]) {
    data.users[userId] = {
      epic: null,
      points: 0,
      activeChallenge: null,
      activeDuelId: null,
      dailyClaimedAt: null,
      purchaseHistory: [],
      giveawayEntries: 0,
      luckyRerollTickets: 0,
      completedChallenges: {
        easy: [],
        medium: [],
        hard: []
      },
      stats: {
        approvedChallenges: 0,
        rejectedProofs: 0,
        rerolls: 0,
        dailyClaims: 0,
        duelWins: 0,
        duelLosses: 0
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

  if (!('activeDuelId' in user)) {
    user.activeDuelId = null;
  }

  if (!('dailyClaimedAt' in user)) {
    user.dailyClaimedAt = null;
  }

  if (!Array.isArray(user.purchaseHistory)) {
    user.purchaseHistory = [];
  }

  if (typeof user.giveawayEntries !== 'number') {
    user.giveawayEntries = 0;
  }

  if (typeof user.luckyRerollTickets !== 'number') {
    user.luckyRerollTickets = 0;
  }

  if (!user.stats) {
    user.stats = {
      approvedChallenges: 0,
      rejectedProofs: 0,
      rerolls: 0,
      dailyClaims: 0,
      duelWins: 0,
      duelLosses: 0
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

  if (typeof user.stats.duelWins !== 'number') {
    user.stats.duelWins = 0;
  }

  if (typeof user.stats.duelLosses !== 'number') {
    user.stats.duelLosses = 0;
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

function parseDurationString(input) {
  if (!input || typeof input !== 'string') return null;

  const normalized = input.toLowerCase().replace(/\s+/g, '');
  const regex = /(\d+)([wdhms])/g;

  let totalMs = 0;
  let matchedText = '';
  let match;

  while ((match = regex.exec(normalized)) !== null) {
    const amount = parseInt(match[1], 10);
    const unit = match[2];

    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    matchedText += match[0];

    if (unit === 'w') totalMs += amount * 7 * 24 * 60 * 60 * 1000;
    if (unit === 'd') totalMs += amount * 24 * 60 * 60 * 1000;
    if (unit === 'h') totalMs += amount * 60 * 60 * 1000;
    if (unit === 'm') totalMs += amount * 60 * 1000;
    if (unit === 's') totalMs += amount * 1000;
  }

  if (matchedText.length !== normalized.length || totalMs <= 0) {
    return null;
  }

  return totalMs;
}

function formatDurationWords(ms) {
  let remainingSeconds = Math.max(1, Math.floor(ms / 1000));
  const parts = [];

  const units = [
    { label: 'w', seconds: 7 * 24 * 60 * 60 },
    { label: 'd', seconds: 24 * 60 * 60 },
    { label: 'h', seconds: 60 * 60 },
    { label: 'm', seconds: 60 },
    { label: 's', seconds: 1 }
  ];

  for (const unit of units) {
    const value = Math.floor(remainingSeconds / unit.seconds);
    if (value > 0) {
      parts.push(`${value}${unit.label}`);
      remainingSeconds -= value * unit.seconds;
    }
  }

  return parts.join(' ');
}

function getUserBonusEntriesInUse(userId) {
  let total = 0;

  for (const giveaway of Object.values(data.giveaways || {})) {
    if (giveaway.status !== 'active') continue;

    const entry = giveaway.entries?.[userId];
    if (!entry) continue;

    total += Math.max(0, entry.bonusEntriesUsed || 0);
  }

  return total;
}

const challenges = {
  easy: [
    'Get 1 elimination',
    'Open 5 chests',
    'Survive 5 minutes',
    'Use 2 healing items in one match',
    'Break 10 objects with your pickaxe',
    'Thank the bus driver',
    'Land at a named POI',
    'Search 3 ammo boxes',
    'Harvest 200 materials',
    'Travel 500 meters in a vehicle',
    'Revive a teammate',
    'Reboot a teammate',
    'Catch 1 fish',
    'Use a zipline',
    'Use 1 shield item',
    'Deal 100 damage with an AR',
    'Deal 50 damage with an SMG',
    'Open 3 produce boxes',
    'Hide in a bush for 10 seconds',
    'Mark an enemy item or location',
    'Use a launch pad',
    'Collect 2 weapons of different rarities',
    'Open 1 supply drone or loot cache',
    'Destroy 5 trees',
    'Travel 250 meters by swimming',
    'Thank the bus driver and survive storm phase 1',
    'Open 2 coolers',
    'Use a medkit',
    'Use bandages or a med mist',
    'Spend 100 gold bars',
    'Hire an NPC',
    'Talk to 1 NPC',
    'Use a vending machine',
    'Deal 100 damage to opponents in one match',
    'Land and survive 3 storm circles',
    'Open 1 rare chest',
    'Break 5 structures with a vehicle',
    'Use a mobility item',
    'Travel 250 meters while sliding',
    'Travel 100 meters while crouched',
    'Collect a shotgun and an AR in the same match',
    'Search 2 floor loot items in 30 seconds after landing',
    'Heal 50 health in storm',
    'Travel from one POI to another in a single match',
    'Use 1 healing item after taking storm damage',
    'Open 7 containers total in one match',
    'Damage an enemy vehicle',
    'Ping 3 locations for your team',
    'Survive until top 50',
    'Open 2 chests in the same building',
    'Carry a common weapon for 2 minutes',
    'Use 1 throwable item',
    'Visit a landmark',
    'Travel 300 meters on foot without sprinting',
    'Destroy 3 pieces of furniture'
  ],
  medium: [
    'Get 3 eliminations',
    'Reach top 10',
    'Travel through 3 POIs',
    'Win a fight using only AR + shotgun',
    'Use no heals until after your first fight',
    'Get 2 eliminations in a named POI',
    'Deal 500 total damage in one match',
    'Open 10 chests',
    'Revive a teammate and survive to top 15',
    'Reboot a teammate and get an elimination after',
    'Use 3 different weapon types in one match',
    'Get an elimination with an SMG',
    'Get an elimination with a shotgun',
    'Get an elimination with an AR',
    'Travel 2000 meters in one match',
    'Use 2 mobility items in one match',
    'Reach top 15 without using a vehicle',
    'Collect 3 shield items in one match',
    'Win your first off-spawn fight',
    'Eliminate an opponent within 60 seconds of landing',
    'Deal 250 damage from above',
    'Damage opponents at 2 different named POIs',
    'Open 2 rare chests in one match',
    'Carry only blue rarity or lower weapons',
    'Use no sniper weapons for the entire match',
    'Get 1 elimination after using a mobility item',
    'Land hot and survive 5 minutes',
    'Complete a bounty',
    'Survive 8 storm circles',
    'Get an elimination with a pistol or sidearm',
    'Get 3 assists or eliminations combined in team modes',
    'Use only weapons found from chests',
    'Use only floor loot weapons',
    'Heal for 150 total in one match',
    'Travel from edge zone to center zone in one match',
    'Break 25 objects in one match',
    'Get an elimination while inside storm circle 4 or later',
    'Reach top 5 with at least 2 eliminations',
    'Carry one weapon from landing to endgame',
    'Use 3 healing items in one match',
    'Eliminate a player using a vehicle or after exiting one',
    'Mark enemies or items 5 times in one match',
    'Spend 500 gold bars',
    'Buy an item and get an elimination with it',
    'Survive without shields until top 25',
    'Travel 500 meters while sliding or sprinting during combat',
    'Open 15 containers in one match',
    'Get 2 eliminations without reloading between them',
    'Use only two weapon slots the whole match',
    'Deal 300 damage with scoped weapons',
    'Reach top 10 after landing at the hottest POI you see',
    'Get 1 elimination in storm',
    'Damage an opponent with 3 different weapons in one match',
    'Use no medkits the whole match',
    'Get a squad wipe with your team involved'
  ],
  hard: [
    'Get 5 eliminations',
    'Win a match',
    'No heals the entire game',
    'Only use loot from your first building',
    'Reach top 3 without using shields',
    'Win a match with 5 eliminations',
    'Get 7 eliminations in one match',
    'Win without using a vehicle',
    'Win using only blue rarity or lower loot',
    'Get 3 eliminations before leaving your drop POI',
    'Reach top 5 with no more than 2 weapons',
    'Use only floor loot and win a fight',
    'Use only chest loot and reach top 10',
    'Get a shotgun-only win fight',
    'Get an AR-only win fight',
    'Get 2 eliminations in final circles',
    'Reach top 3 after landing at the map edge',
    'Travel across 5 POIs and reach top 10',
    'Get 1 elimination with no shields all match',
    'Win a trios or squads game with at least 1 reboot',
    'Get 5 eliminations without carrying an SMG',
    'Get 5 eliminations without carrying a shotgun',
    'Get 5 eliminations without carrying an AR',
    'Reach top 5 while carrying one common weapon',
    'No heals until top 10 and still reach top 3',
    'Eliminate a full duo or squad with your team',
    'Survive to top 5 after being rebooted',
    'Get back-to-back eliminations within 30 seconds',
    'Deal 1000 damage in one match',
    'Win without buying anything from NPCs or vending machines',
    'Use only your first two weapons for the whole match',
    'Get 2 eliminations while in storm and survive',
    'Reach top 3 without opening more than 5 chests',
    'Land hot, get 4 eliminations, and reach top 10',
    'Get 1 crowned elimination if crowns are in game',
    'Win using only weapons from eliminated players',
    'Reach top 5 without sprinting',
    'Get an elimination in 3 different POIs in one match',
    'Use no mobility items and reach top 3',
    'Get 6 eliminations with at least 3 different weapon types',
    'Survive from your landing spot to endgame without rotating by vehicle',
    'Get 4 eliminations before storm circle 3 closes',
    'Win after starting the match with no shields equipped until midgame',
    'Reach top 3 after completing a bounty',
    'Use only two heals for the entire match and reach top 5',
    'Get 5 eliminations while carrying a pistol or sidearm all game',
    'No reload challenge: get an elimination after swapping weapons instead of reloading',
    'Reach top 5 after landing at the first POI under the bus route',
    'Get a final zone elimination for the win',
    'Win with your squad and be top damage on the team',
    'Reach top 3 while using no hired NPCs',
    'Get 3 eliminations with headshots',
    'Carry a grey or green weapon into final circle',
    'Win after rerouting through 4 named locations',
    'Take no storm damage for the entire match and reach top 3'
  ]
};

const duelChallenges = {
  easy: [
    'First to 1 elimination in your next match',
    'Higher placement in your next match',
    'Most chests opened in your next match',
    'Most damage dealt in your next match',
    'First to survive 5 minutes in your next match'
  ],
  medium: [
    'First to 3 eliminations in your next match',
    'Most eliminations in your next match',
    'Most damage dealt in your next match',
    'Better placement in your next match',
    'First to open 10 chests in your next match',
    'First to survive until top 10 in your next match'
  ],
  hard: [
    'First to 5 eliminations in your next match',
    'Win a match before the other player',
    'Most eliminations and better placement in your next match',
    'First to reach top 5 with at least 3 eliminations',
    'Most total damage in your next match',
    'First to win an off-spawn fight and reach top 10'
  ]
};

const mysteryBoxRewards = [
  {
    id: 'points_20',
    weight: 28,
    label: '20 Bonus Points',
    apply(userData) {
      userData.points += 20;
      return {
        label: '20 Bonus Points',
        publicText: 'You received **20 bonus points**.',
        staffText: 'Automatically added 20 points.',
        rewardType: 'points',
        amount: 20
      };
    }
  },
  {
    id: 'points_35',
    weight: 18,
    label: '35 Bonus Points',
    apply(userData) {
      userData.points += 35;
      return {
        label: '35 Bonus Points',
        publicText: 'You received **35 bonus points**.',
        staffText: 'Automatically added 35 points.',
        rewardType: 'points',
        amount: 35
      };
    }
  },
  {
    id: 'points_60',
    weight: 7,
    label: '60 Bonus Points',
    apply(userData) {
      userData.points += 60;
      return {
        label: '60 Bonus Points',
        publicText: 'You received **60 bonus points**.',
        staffText: 'Automatically added 60 points.',
        rewardType: 'points',
        amount: 60
      };
    }
  },
  {
    id: 'giveaway_1',
    weight: 18,
    label: '1 Bonus Giveaway Entry',
    apply(userData) {
      userData.giveawayEntries += 1;
      return {
        label: '1 Bonus Giveaway Entry',
        publicText: 'You received **1 bonus giveaway entry**.',
        staffText: 'Automatically stored 1 bonus giveaway entry.',
        rewardType: 'giveawayEntries',
        amount: 1
      };
    }
  },
  {
    id: 'giveaway_2',
    weight: 8,
    label: '2 Bonus Giveaway Entries',
    apply(userData) {
      userData.giveawayEntries += 2;
      return {
        label: '2 Bonus Giveaway Entries',
        publicText: 'You received **2 bonus giveaway entries**.',
        staffText: 'Automatically stored 2 bonus giveaway entries.',
        rewardType: 'giveawayEntries',
        amount: 2
      };
    }
  },
  {
    id: 'reroll_1',
    weight: 15,
    label: '1 Lucky Reroll Ticket',
    apply(userData) {
      userData.luckyRerollTickets += 1;
      return {
        label: '1 Lucky Reroll Ticket',
        publicText: 'You received **1 Lucky Reroll Ticket**.',
        staffText: 'Automatically stored 1 Lucky Reroll Ticket.',
        rewardType: 'luckyRerollTickets',
        amount: 1
      };
    }
  },
  {
    id: 'reroll_2',
    weight: 4,
    label: '2 Lucky Reroll Tickets',
    apply(userData) {
      userData.luckyRerollTickets += 2;
      return {
        label: '2 Lucky Reroll Tickets',
        publicText: 'You received **2 Lucky Reroll Tickets**.',
        staffText: 'Automatically stored 2 Lucky Reroll Tickets.',
        rewardType: 'luckyRerollTickets',
        amount: 2
      };
    }
  },
  {
    id: 'jackpot_bundle',
    weight: 2,
    label: 'Jackpot Bundle',
    apply(userData) {
      userData.points += 40;
      userData.giveawayEntries += 1;
      userData.luckyRerollTickets += 1;
      return {
        label: 'Jackpot Bundle',
        publicText: 'You hit the **Jackpot Bundle**: **40 points**, **1 bonus giveaway entry**, and **1 Lucky Reroll Ticket**.',
        staffText: 'Automatically granted jackpot bundle: 40 points, 1 giveaway entry, 1 Lucky Reroll Ticket.',
        rewardType: 'bundle',
        amount: null
      };
    }
  }
];

const shopItems = [
  {
    id: 'giveaway',
    name: 'Giveaway Entry',
    emoji: '🎟️',
    cost: 25,
    category: 'Giveaway',
    description: 'Buy 1 extra giveaway entry and keep it stored until you join an active giveaway.',
    delivery: 'It is stored automatically and gets used the moment you enter a giveaway.'
  },
  {
    id: 'skippass',
    name: 'Lucky Reroll Ticket',
    emoji: '🎲',
    cost: 45,
    category: 'Challenge Help',
    description: 'Use 1 extra reroll after your normal challenge reroll has already been used.',
    delivery: 'It is stored automatically and gets consumed the next time you use /reroll after your free reroll is gone.'
  },
  {
    id: 'mystery',
    name: 'Mystery Box',
    emoji: '🎁',
    cost: 60,
    category: 'Random Reward',
    description: 'Open it instantly for an automatic random reward like bonus points, giveaway entries, Lucky Reroll Tickets, or a jackpot bundle.',
    delivery: 'It opens automatically the moment you buy it. No staff action needed.'
  },
  {
    id: 'featuredclip',
    name: 'Featured Clip Submission',
    emoji: '📹',
    cost: 75,
    category: 'Community Feature',
    description: 'Submit 1 clip for featured clip review.',
    delivery: 'Staff reviews the purchased submission.'
  },
  {
    id: 'customrole',
    name: 'Custom Role Request',
    emoji: '✨',
    cost: 100,
    category: 'Server Perk',
    description: 'Request a custom server role from staff.',
    delivery: 'Staff creates or reviews your role request.'
  }
];

function getShopItem(itemId) {
  return shopItems.find(item => item.id === itemId) || null;
}

function pickMysteryBoxReward() {
  const totalWeight = mysteryBoxRewards.reduce((sum, reward) => sum + reward.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const reward of mysteryBoxRewards) {
    roll -= reward.weight;
    if (roll <= 0) {
      return reward;
    }
  }

  return mysteryBoxRewards[mysteryBoxRewards.length - 1];
}

function applyMysteryBoxReward(userData) {
  const reward = pickMysteryBoxReward();
  return reward.apply(userData);
}

function buildShopEmbed(userData, userId = null) {
  const bonusInUse = userId ? getUserBonusEntriesInUse(userId) : 0;

  const descriptionLines = [
    `**Your balance:** ${userData.points} points`
  ];

  if ((userData.giveawayEntries || 0) > 0) {
    descriptionLines.push(`**Bonus giveaway entries:** ${userData.giveawayEntries || 0}`);
  }

  if ((userData.luckyRerollTickets || 0) > 0) {
    descriptionLines.push(`**Lucky reroll tickets:** ${userData.luckyRerollTickets || 0}`);
  }

  if (bonusInUse > 0) {
    descriptionLines.push(`**Bonus entries being used:** ${bonusInUse}`);
  }

  descriptionLines.push(
    '',
    'Spend your points on server rewards.',
    'After you buy something, it is logged for staff in the purchases channel.',
    'Automatic items are delivered instantly with no staff action needed.'
  );

  const embed = new EmbedBuilder()
    .setTitle('🛒 StormBuddy Reward Shop')
    .setColor('Gold')
    .setDescription(descriptionLines.join('\n'))
    .addFields(
      ...shopItems.map(item => ({
        name: `${item.emoji} ${item.name} — ${item.cost} pts`,
        value: `**Category:** ${item.category}\n**Reward:** ${item.description}\n**How it works:** ${item.delivery}`,
        inline: false
      }))
    )
    .setFooter({ text: 'Buttons disable automatically if you do not have enough points.' });

  return embed;
}

function buildShopButtons(userData) {
  const firstRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buy_giveaway')
      .setLabel('Giveaway')
      .setEmoji('🎟️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(userData.points < getShopItem('giveaway').cost),
    new ButtonBuilder()
      .setCustomId('buy_skippass')
      .setLabel('Lucky Reroll')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(userData.points < getShopItem('skippass').cost),
    new ButtonBuilder()
      .setCustomId('buy_mystery')
      .setLabel('Mystery Box')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Success)
      .setDisabled(userData.points < getShopItem('mystery').cost)
  );

  const secondRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buy_featuredclip')
      .setLabel('Featured Clip')
      .setEmoji('📹')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(userData.points < getShopItem('featuredclip').cost),
    new ButtonBuilder()
      .setCustomId('buy_customrole')
      .setLabel('Custom Role')
      .setEmoji('✨')
      .setStyle(ButtonStyle.Success)
      .setDisabled(userData.points < getShopItem('customrole').cost)
  );

  return [firstRow, secondRow];
}

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

function pickDuelChallenge(difficulty) {
  const pool = duelChallenges[difficulty] || [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
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

function buildLfgButtons(hostId, closed = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lfgjoin_${hostId}`)
      .setLabel('Join')
      .setStyle(ButtonStyle.Success)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`lfginterested_${hostId}`)
      .setLabel('Interested')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(closed),
    new ButtonBuilder()
      .setCustomId(`lfgfull_${hostId}`)
      .setLabel(closed ? 'Full' : 'Mark Full')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(closed)
  );
}

function buildDuelEmbed(duel) {
  const statusMap = {
    active: 'ACTIVE',
    pending: 'PENDING REVIEW',
    completed: 'COMPLETED',
    cancelled: 'CANCELLED'
  };

  return new EmbedBuilder()
    .setTitle('⚔️ Duel Challenge')
    .setColor(
      duel.status === 'completed'
        ? 'Green'
        : duel.status === 'pending'
        ? 'Orange'
        : duel.status === 'cancelled'
        ? 'Red'
        : 'Blurple'
    )
    .setDescription(`**${duel.challengeText}**`)
    .addFields(
      { name: 'Challenger', value: `<@${duel.challengerId}>`, inline: true },
      { name: 'Opponent', value: `<@${duel.opponentId}>`, inline: true },
      { name: 'Difficulty', value: duel.difficulty.toUpperCase(), inline: true },
      { name: 'Reward', value: `${duel.points} points`, inline: true },
      { name: 'Status', value: statusMap[duel.status] || duel.status.toUpperCase(), inline: true },
      { name: 'Submitted By', value: duel.submittedBy ? `<@${duel.submittedBy}>` : 'No proof yet', inline: true }
    )
    .setFooter({ text: `Duel ID: ${duel.id}` })
    .setTimestamp();
}

function buildDuelButtons(duelId, pending = false, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duelsubmit_${duelId}`)
      .setLabel(pending ? 'Proof Submitted' : 'Submit Proof')
      .setStyle(ButtonStyle.Success)
      .setDisabled(pending || disabled),
    new ButtonBuilder()
      .setCustomId(`duelcancel_${duelId}`)
      .setLabel('Cancel Duel')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function buildDuelReviewButtons(duelId, challengerId, opponentId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`duelwin_${duelId}_${challengerId}`)
      .setLabel('Challenger Wins')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`duelwin_${duelId}_${opponentId}`)
      .setLabel('Opponent Wins')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`duelreviewcancel_${duelId}`)
      .setLabel('Cancel Duel')
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

function getDuelById(duelId) {
  return data.duels[duelId] || null;
}

function clearUserActiveDuel(userId, duelId) {
  const user = ensureUser(userId);
  if (user.activeDuelId === duelId) {
    user.activeDuelId = null;
  }
}

function getGiveawayById(giveawayId) {
  return data.giveaways[giveawayId] || null;
}

function isSupportedTextChannel(channel) {
  return (
    channel &&
    (
      channel.type === ChannelType.GuildText ||
      channel.type === ChannelType.PublicThread ||
      channel.type === ChannelType.PrivateThread ||
      channel.type === ChannelType.AnnouncementThread ||
      channel.type === ChannelType.GuildAnnouncement
    )
  );
}

function buildGiveawayEmbed(giveaway) {
  const entrants = Object.keys(giveaway.entries || {});
  const winners = giveaway.winnerIds || [];
  const endUnix = Math.floor((giveaway.endsAt || Date.now()) / 1000);

  return new EmbedBuilder()
    .setTitle('🎉 Server Giveaway')
    .setColor(giveaway.status === 'ended' ? 'Red' : 'Blurple')
    .setDescription(`**Prize:** ${giveaway.prize}`)
    .addFields(
      { name: 'Status', value: giveaway.status === 'ended' ? 'ENDED' : 'ACTIVE', inline: true },
      { name: 'Winners', value: `${giveaway.winnersCount}`, inline: true },
      { name: 'Entries', value: `${entrants.length}`, inline: true },
      {
        name: giveaway.status === 'ended' ? 'Ended' : 'Ends',
        value: `<t:${endUnix}:F>\n<t:${endUnix}:R>`,
        inline: false
      },
      {
        name: 'How To Enter',
        value: 'Press the button below to enter.\nIf you have stored bonus giveaway entries, they are automatically applied the moment you join.',
        inline: false
      },
      {
        name: 'Giveaway ID',
        value: giveaway.id,
        inline: false
      }
    )
    .addFields(
      giveaway.status === 'ended'
        ? [{
            name: 'Winner(s)',
            value: winners.length > 0 ? winners.map(id => `<@${id}>`).join(', ') : 'No valid entries',
            inline: false
          }]
        : []
    )
    .setFooter({ text: `Hosted by ${giveaway.hostTag || 'Staff'}` })
    .setTimestamp(giveaway.createdAt || Date.now());
}

function buildGiveawayButtons(giveaway, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`givejoin_${giveaway.id}`)
      .setLabel(giveaway.status === 'ended' ? 'Giveaway Ended' : 'Enter Giveaway')
      .setEmoji('🎉')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled || giveaway.status === 'ended')
  );
}

function chooseWeightedWinners(weightMap, winnerCount) {
  const winners = [];
  const workingMap = { ...weightMap };

  while (winners.length < winnerCount) {
    const entries = Object.entries(workingMap);

    if (entries.length === 0) {
      break;
    }

    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);

    if (totalWeight <= 0) {
      break;
    }

    let roll = Math.random() * totalWeight;
    let chosenUserId = null;

    for (const [userId, weight] of entries) {
      roll -= weight;
      if (roll <= 0) {
        chosenUserId = userId;
        break;
      }
    }

    if (!chosenUserId) {
      chosenUserId = entries[entries.length - 1][0];
    }

    winners.push(chosenUserId);
    delete workingMap[chosenUserId];
  }

  return winners;
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

async function updateOriginalDuelMessage(duel, options = {}) {
  if (!duel?.sourceChannelId || !duel?.sourceMessageId) return false;

  try {
    const message = await getMessageFromStoredLocation(
      duel.sourceChannelId,
      duel.sourceMessageId
    );

    if (!message) {
      console.error('Original duel message not found.');
      return false;
    }

    await message.edit({
      content: options.content ?? '',
      embeds: [buildDuelEmbed(duel)],
      components: options.components ?? [
        buildDuelButtons(
          duel.id,
          duel.status === 'pending',
          duel.status === 'completed' || duel.status === 'cancelled'
        )
      ]
    });

    return true;
  } catch (err) {
    console.error('Failed to update original duel message:', err);
    return false;
  }
}

async function updateGiveawayMessage(giveaway, options = {}) {
  if (!giveaway?.channelId || !giveaway?.messageId) return false;

  try {
    const message = await getMessageFromStoredLocation(giveaway.channelId, giveaway.messageId);

    if (!message) {
      console.error('Original giveaway message not found.');
      return false;
    }

    await message.edit({
      content: options.content ?? '',
      embeds: [buildGiveawayEmbed(giveaway)],
      components: options.components ?? [buildGiveawayButtons(giveaway, giveaway.status === 'ended')]
    });

    return true;
  } catch (err) {
    console.error('Failed to update giveaway message:', err);
    return false;
  }
}

async function endGiveaway(giveawayId, endedBy = 'StormBuddy') {
  const giveaway = getGiveawayById(giveawayId);

  if (!giveaway) {
    return { ok: false, message: 'That giveaway does not exist.' };
  }

  if (giveaway.status === 'ended') {
    return { ok: false, message: 'That giveaway has already ended.' };
  }

  const entrantIds = Object.keys(giveaway.entries || {});
  const weightMap = {};

  for (const userId of entrantIds) {
    const userData = ensureUser(userId);
    const entryData = giveaway.entries[userId] || {};
    const bonusEntriesUsed =
      typeof entryData.bonusEntriesUsed === 'number'
        ? Math.max(0, entryData.bonusEntriesUsed)
        : Math.max(0, userData.giveawayEntries || 0);

    weightMap[userId] = 1 + bonusEntriesUsed;
  }

  const winners = chooseWeightedWinners(
    weightMap,
    Math.min(giveaway.winnersCount, entrantIds.length)
  );

  giveaway.status = 'ended';
  giveaway.endedAt = Date.now();
  giveaway.endedBy = endedBy;
  giveaway.winnerIds = winners;

  saveData();

  await updateGiveawayMessage(giveaway, {
    components: [buildGiveawayButtons(giveaway, true)]
  });

  try {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);

    if (isSupportedTextChannel(channel)) {
      if (winners.length > 0) {
        await channel.send(
          `🎉 Giveaway ended for **${giveaway.prize}**!\nWinner${winners.length === 1 ? '' : 's'}: ${winners.map(id => `<@${id}>`).join(', ')}`
        );
      } else {
        await channel.send(`⚠️ Giveaway ended for **${giveaway.prize}** but there were no valid entries.`);
      }
    }
  } catch (err) {
    console.error('Failed to announce giveaway result:', err);
  }

  return {
    ok: true,
    giveaway,
    winners,
    entrantCount: entrantIds.length
  };
}

async function checkExpiredGiveaways() {
  const now = Date.now();

  for (const giveaway of Object.values(data.giveaways || {})) {
    if (giveaway.status === 'active' && giveaway.endsAt <= now) {
      await endGiveaway(giveaway.id, 'Automatic timer');
    }
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
    )
    .addStringOption(option =>
      option
        .setName('region')
        .setDescription('Your region')
        .setRequired(true)
        .addChoices(
          { name: 'NA East', value: 'NA East' },
          { name: 'NA Central', value: 'NA Central' },
          { name: 'NA West', value: 'NA West' },
          { name: 'Europe', value: 'Europe' },
          { name: 'Brazil', value: 'Brazil' },
          { name: 'Asia', value: 'Asia' },
          { name: 'Middle East', value: 'Middle East' },
          { name: 'Oceania', value: 'Oceania' }
        )
    )
    .addStringOption(option =>
      option
        .setName('mic')
        .setDescription('Mic required?')
        .setRequired(true)
        .addChoices(
          { name: 'Mic On', value: 'Mic On' },
          { name: 'No Mic Needed', value: 'No Mic Needed' }
        )
    )
    .addIntegerOption(option =>
      option
        .setName('players_needed')
        .setDescription('How many players do you need?')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(3)
    )
    .addStringOption(option =>
      option
        .setName('rank')
        .setDescription('Optional rank')
        .setRequired(false)
    )
    .addStringOption(option =>
      option
        .setName('note')
        .setDescription('Optional note for your post')
        .setRequired(false)
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
    .setName('duelchallenge')
    .setDescription('Challenge another player to a Fortnite duel')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('Who you want to duel')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('difficulty')
        .setDescription('Choose duel difficulty')
        .setRequired(true)
        .addChoices(
          { name: 'Easy', value: 'easy' },
          { name: 'Medium', value: 'medium' },
          { name: 'Hard', value: 'hard' }
        )
    ),

  new SlashCommandBuilder()
    .setName('reroll')
    .setDescription('Reroll your current active challenge once, then use Lucky Reroll Tickets for extra rerolls'),

  new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily StormBuddy points'),

  new SlashCommandBuilder()
    .setName('claimdailyfor')
    .setDescription('Claim daily StormBuddy points for another user')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user to claim daily points for')
        .setRequired(true)
    ),

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
    .setName('shop')
    .setDescription('Spend your StormBuddy points in the shop'),

  new SlashCommandBuilder()
    .setName('giveway')
    .setDescription('Create, edit, or end a giveaway')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a giveaway')
        .addStringOption(option =>
          option
            .setName('prize')
            .setDescription('What the giveaway prize is')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('duration')
            .setDescription('Examples: 30m, 2h, 1d12h, 1w, 1w2d3h4m5s')
            .setRequired(true)
        )
        .addIntegerOption(option =>
          option
            .setName('winners')
            .setDescription('How many winners')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(20)
        )
        .addChannelOption(option =>
          option
            .setName('channel')
            .setDescription('Where to post the giveaway')
            .setRequired(false)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('end')
        .setDescription('End a giveaway')
        .addStringOption(option =>
          option
            .setName('giveaway_id')
            .setDescription('The giveaway ID')
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('edit')
        .setDescription('Edit a giveaway')
        .addStringOption(option =>
          option
            .setName('giveaway_id')
            .setDescription('The giveaway ID')
            .setRequired(true)
        )
        .addStringOption(option =>
          option
            .setName('prize')
            .setDescription('New prize text')
            .setRequired(false)
        )
        .addStringOption(option =>
          option
            .setName('add_time')
            .setDescription('Extra time to add. Examples: 30m, 2h, 1d12h')
            .setRequired(false)
        )
        .addIntegerOption(option =>
          option
            .setName('winners')
            .setDescription('New winner count')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(20)
        )
    ),

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
    .setName('setepicuser')
    .setDescription('Set another user’s Epic username')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose Epic you want to set')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('username')
        .setDescription('The Epic username to set')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('senddm')
    .setDescription('Send a DM to a user as StormBuddy')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('User to DM')
        .setRequired(true)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setDescription('Message to send')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('clearchallenge')
    .setDescription('Clear a user’s stuck active challenge')
    .addUserOption(option =>
      option
        .setName('user')
        .setDescription('The user whose challenge you want to clear')
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
  await checkExpiredGiveaways();
  setInterval(checkExpiredGiveaways, 15000);
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

client.on(Events.MessageCreate, async message => {
  try {
    if (message.author.bot) return;
    if (message.guild) return;

    console.log(`DM from ${message.author.tag}: ${message.content}`);

    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      await message.reply('❌ I could not find the server.');
      return;
    }

    await guild.channels.fetch();

    const userRepliesChannel =
      guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === 'user-replies'
      ) ||
      guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.name === 'user replies'
      );

    if (!userRepliesChannel) {
      await message.reply('❌ I could not find the #user-replies channel in the server.');
      return;
    }

    const member = await guild.members.fetch(message.author.id).catch(() => null);
    const storedUser = data.users[message.author.id];

    const forwardEmbed = new EmbedBuilder()
      .setTitle('📩 User Reply')
      .setColor('Blue')
      .setDescription(message.content || '*No text content*')
      .addFields(
        { name: 'User', value: `${message.author.tag}`, inline: true },
        { name: 'Discord ID', value: `${message.author.id}`, inline: true },
        { name: 'Epic', value: storedUser?.epic || 'Not set', inline: true },
        { name: 'In Server', value: member ? 'Yes' : 'No', inline: true }
      )
      .setTimestamp();

    if (message.attachments.size > 0) {
      const attachmentList = message.attachments.map(a => a.url).join('\n');
      forwardEmbed.addFields({
        name: 'Attachments',
        value: attachmentList.slice(0, 1024),
        inline: false
      });
    }

    await userRepliesChannel.send({
      content: `📨 New DM from <@${message.author.id}>`,
      embeds: [forwardEmbed]
    });

    await message.reply('📩 Your reply was sent to the staff team.');
  } catch (err) {
    console.error('DM handler error:', err);

    try {
      await message.reply('❌ Something broke while sending your reply to staff.');
    } catch (replyErr) {
      console.error('Failed to reply in DM:', replyErr);
    }
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
                '`/setepic` — set your own Epic username',
                '`/challenge` — get a challenge',
                '`/duelchallenge` — challenge another player',
                '`/reroll` — reroll your active challenge once or use Lucky Reroll Tickets',
                '`/daily` — claim daily bonus points',
                '`/profile` — view stats',
                '`/leaderboard` — top players',
                '`/shop` — spend your points',
                '`/lfg` — find teammates'
              ].join('\n')
            },
            {
              name: 'Staff Commands',
              value: [
                '`/giveway create`',
                '`/giveway edit`',
                '`/giveway end`',
                '`/setpoints`',
                '`/setuserpoints`',
                '`/addpoints`',
                '`/removepoints`',
                '`/setepicuser`',
                '`/claimdailyfor`',
                '`/senddm`',
                '`/clearchallenge`',
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
        const region = interaction.options.getString('region');
        const mic = interaction.options.getString('mic');
        const playersNeeded = interaction.options.getInteger('players_needed');
        const rank = interaction.options.getString('rank') || 'Any';
        const note = interaction.options.getString('note') || 'No extra notes.';
        const epicName = userData.epic || 'Not set — use /setepic';

        const embed = new EmbedBuilder()
          .setTitle('🎮 LFG - Looking for Teammates')
          .setColor('Blue')
          .setDescription(`${interaction.user} is looking for teammates.`)
          .addFields(
            { name: 'Mode', value: mode, inline: true },
            { name: 'Region', value: region, inline: true },
            { name: 'Mic', value: mic, inline: true },
            { name: 'Players Needed', value: `${playersNeeded}`, inline: true },
            { name: 'Rank', value: rank, inline: true },
            { name: 'Epic Username', value: epicName, inline: true },
            { name: 'Host', value: interaction.user.tag, inline: true },
            { name: 'Note', value: note, inline: false }
          )
          .setFooter({ text: 'Use the buttons below to join or show interest.' })
          .setTimestamp();

        await interaction.reply({
          embeds: [embed],
          components: [buildLfgButtons(interaction.user.id)]
        });
        return;
      }

      if (interaction.commandName === 'setepic') {
  const username = interaction.options.getString('username');
  const userData = ensureUser(interaction.user.id);

  const validEpic = await isValidEpicUsername(username);

  if (!validEpic) {
    await interaction.reply({
      content: '❌ That is not a valid Epic Games username.',
      ephemeral: true
    });
    return;
  }

  userData.epic = username;
  saveData();

  await interaction.reply({
    content: `✅ Your Epic username is now set to **${username}**`
  });

  return;
}
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

      if (interaction.commandName === 'claimdailyfor') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const targetUserData = ensureUser(targetUser.id);

        const now = Date.now();
        const lastClaim = targetUserData.dailyClaimedAt || 0;
        const cooldown = 24 * 60 * 60 * 1000;
        const remaining = cooldown - (now - lastClaim);

        if (remaining > 0) {
          await interaction.reply({
            content: `⏳ **${targetUser.tag}** already claimed their daily reward. Try again in **${formatCooldown(remaining)}**.`,
            ephemeral: true
          });
          return;
        }

        targetUserData.points += DAILY_POINTS;
        targetUserData.dailyClaimedAt = now;
        targetUserData.stats.dailyClaims += 1;
        saveData();

        await interaction.reply(`🎁 Claimed daily reward for **${targetUser.tag}**. They earned **${DAILY_POINTS}** points and now have **${targetUserData.points}** points.`);
        return;
      }

      if (interaction.commandName === 'profile') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetData = ensureUser(targetUser.id);
        const bonusEntriesStored = targetData.giveawayEntries || 0;
        const bonusEntriesInUse = getUserBonusEntriesInUse(targetUser.id);

        const fields = [
          { name: 'Epic', value: targetData.epic || 'Not set', inline: true },
          { name: 'Points', value: `${targetData.points}`, inline: true }
        ];

        if (bonusEntriesStored > 0) {
          fields.push({ name: 'Bonus Giveaway Entries', value: `${bonusEntriesStored}`, inline: true });
        }

        if ((targetData.luckyRerollTickets || 0) > 0) {
          fields.push({ name: 'Lucky Reroll Tickets', value: `${targetData.luckyRerollTickets}`, inline: true });
        }

        if (bonusEntriesInUse > 0) {
          fields.push({ name: 'Bonus Entries Being Used', value: `${bonusEntriesInUse}`, inline: true });
        }

        fields.push(
          { name: 'Active Challenge', value: targetData.activeChallenge ? targetData.activeChallenge.text : 'None', inline: false },
          { name: 'Active Duel', value: targetData.activeDuelId ? `Duel ID: ${targetData.activeDuelId}` : 'None', inline: false },
          { name: 'Approved Challenges', value: `${targetData.stats.approvedChallenges}`, inline: true },
          { name: 'Rejected Proofs', value: `${targetData.stats.rejectedProofs}`, inline: true },
          { name: 'Rerolls Used', value: `${targetData.stats.rerolls}`, inline: true },
          { name: 'Daily Claims', value: `${targetData.stats.dailyClaims}`, inline: true },
          { name: 'Duel Wins', value: `${targetData.stats.duelWins}`, inline: true },
          { name: 'Duel Losses', value: `${targetData.stats.duelLosses}`, inline: true },
          {
            name: 'Completed by Difficulty',
            value: `Easy: ${targetData.completedChallenges.easy.length}\nMedium: ${targetData.completedChallenges.medium.length}\nHard: ${targetData.completedChallenges.hard.length}`,
            inline: false
          }
        );

        const embed = new EmbedBuilder()
          .setTitle(`📊 ${targetUser.username}'s StormBuddy Profile`)
          .setColor('Aqua')
          .addFields(fields)
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
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

      if (interaction.commandName === 'shop') {
        await interaction.reply({
          embeds: [buildShopEmbed(userData, userId)],
          components: buildShopButtons(userData),
          ephemeral: true
        });
        return;
      }

      if (interaction.commandName === 'giveway') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'create') {
          const prize = interaction.options.getString('prize');
          const durationInput = interaction.options.getString('duration');
          const durationMs = parseDurationString(durationInput);
          const winners = interaction.options.getInteger('winners');
          const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

          if (!durationMs) {
            await interaction.reply({
              content: '❌ Invalid duration format. Use something like `30m`, `2h`, `1d12h`, or `1w2d3h4m5s`.',
              ephemeral: true
            });
            return;
          }

          if (!isSupportedTextChannel(targetChannel)) {
            await interaction.reply({
              content: '❌ That channel is not a supported text channel.',
              ephemeral: true
            });
            return;
          }

          const giveawayId = makeId();
          const giveaway = {
            id: giveawayId,
            prize,
            winnersCount: winners,
            hostId: interaction.user.id,
            hostTag: interaction.user.tag,
            status: 'active',
            createdAt: Date.now(),
            endsAt: Date.now() + durationMs,
            entries: {},
            winnerIds: [],
            channelId: null,
            messageId: null,
            endedAt: null,
            endedBy: null
          };

          const sentMessage = await targetChannel.send({
            embeds: [buildGiveawayEmbed(giveaway)],
            components: [buildGiveawayButtons(giveaway)]
          });

          giveaway.channelId = sentMessage.channelId;
          giveaway.messageId = sentMessage.id;
          data.giveaways[giveawayId] = giveaway;
          saveData();

          await interaction.reply({
            content: `✅ Giveaway created in ${targetChannel}.\n**ID:** \`${giveawayId}\`\n**Duration:** \`${formatDurationWords(durationMs)}\``,
            ephemeral: true
          });
          return;
        }

        if (subcommand === 'end') {
          const giveawayId = interaction.options.getString('giveaway_id');
          const result = await endGiveaway(giveawayId, interaction.user.tag);

          if (!result.ok) {
            await interaction.reply({
              content: `❌ ${result.message}`,
              ephemeral: true
            });
            return;
          }

          await interaction.reply({
            content: result.winners.length > 0
              ? `✅ Giveaway ended.\nWinner${result.winners.length === 1 ? '' : 's'}: ${result.winners.map(id => `<@${id}>`).join(', ')}`
              : '✅ Giveaway ended, but there were no valid entries.',
            ephemeral: true
          });
          return;
        }

        if (subcommand === 'edit') {
          const giveawayId = interaction.options.getString('giveaway_id');
          const prize = interaction.options.getString('prize');
          const addTimeInput = interaction.options.getString('add_time');
          const winners = interaction.options.getInteger('winners');
          const addTimeMs = addTimeInput ? parseDurationString(addTimeInput) : null;

          const giveaway = getGiveawayById(giveawayId);

          if (!giveaway) {
            await interaction.reply({
              content: '❌ That giveaway does not exist.',
              ephemeral: true
            });
            return;
          }

          if (giveaway.status === 'ended') {
            await interaction.reply({
              content: '❌ You cannot edit a giveaway that already ended.',
              ephemeral: true
            });
            return;
          }

          if (addTimeInput && !addTimeMs) {
            await interaction.reply({
              content: '❌ Invalid add_time format. Use something like `30m`, `2h`, `1d12h`, or `1w2d3h4m5s`.',
              ephemeral: true
            });
            return;
          }

          if (!prize && !addTimeInput && !winners) {
            await interaction.reply({
              content: '❌ You need to change at least one thing.',
              ephemeral: true
            });
            return;
          }

          if (prize) {
            giveaway.prize = prize;
          }

          if (typeof addTimeMs === 'number') {
            giveaway.endsAt += addTimeMs;
          }

          if (typeof winners === 'number') {
            giveaway.winnersCount = winners;
          }

          saveData();

          await updateGiveawayMessage(giveaway);

          await interaction.reply({
            content: `✅ Giveaway \`${giveaway.id}\` updated.${addTimeMs ? ` Added \`${formatDurationWords(addTimeMs)}\`.` : ''}`,
            ephemeral: true
          });
          return;
        }
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

      if (interaction.commandName === 'setepicuser') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const username = interaction.options.getString('username');

        const targetUserData = ensureUser(targetUser.id);
        targetUserData.epic = username;
        saveData();

        await interaction.reply({
          content: `✅ **${targetUser.tag}** now has Epic username set to **${username}**.`
        });
        return;
      }

      if (interaction.commandName === 'senddm') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const message = interaction.options.getString('message');

        try {
          const dmEmbed = new EmbedBuilder()
            .setTitle('📩 Message from StormBuddy')
            .setColor('Blue')
            .setDescription(message)
            .setFooter({ text: `Sent by ${interaction.user.tag}` })
            .setTimestamp();

          await targetUser.send({ embeds: [dmEmbed] });

          await interaction.reply({
            content: `✅ Sent a DM to **${targetUser.tag}**.`,
            ephemeral: true
          });
        } catch (err) {
          console.error('Failed to send DM:', err);

          await interaction.reply({
            content: `❌ I couldn't DM **${targetUser.tag}**. They may have DMs closed.`,
            ephemeral: true
          });
        }

        return;
      }

      if (interaction.commandName === 'clearchallenge') {
        if (!isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only admins or mods can use this.',
            ephemeral: true
          });
          return;
        }

        const targetUser = interaction.options.getUser('user');
        const targetUserData = ensureUser(targetUser.id);

        if (!targetUserData.activeChallenge) {
          await interaction.reply({
            content: `ℹ️ **${targetUser.tag}** does not currently have an active challenge.`,
            ephemeral: true
          });
          return;
        }

        const oldChallenge = targetUserData.activeChallenge;

        if (oldChallenge.sourceChannelId && oldChallenge.sourceMessageId) {
          const clearedChallenge = {
            ...oldChallenge,
            status: 'cancelled'
          };

          await updateOriginalChallengeMessage(targetUserData, clearedChallenge, {
            content: '🧹 This challenge was cleared by staff.',
            components: [buildChallengeButtons(clearedChallenge.id, false, true)]
          });
        }

        targetUserData.activeChallenge = null;
        saveData();

        await interaction.reply({
          content: `✅ Cleared the active challenge for **${targetUser.tag}**. They can now use \`/challenge\` again.`
        });
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

      if (interaction.commandName === 'duelchallenge') {
        const opponent = interaction.options.getUser('user');
        const difficulty = interaction.options.getString('difficulty');

        if (opponent.id === interaction.user.id) {
          await interaction.reply({
            content: '❌ You cannot duel yourself.',
            ephemeral: true
          });
          return;
        }

        if (opponent.bot) {
          await interaction.reply({
            content: '❌ You cannot duel a bot.',
            ephemeral: true
          });
          return;
        }

        const opponentData = ensureUser(opponent.id);

        if (!userData.epic) {
          await interaction.reply({
            content: '❌ You must set your Epic first using `/setepic`.',
            ephemeral: true
          });
          return;
        }

        if (!opponentData.epic) {
          await interaction.reply({
            content: `❌ **${opponent.tag}** must set their Epic username first before they can duel.`,
            ephemeral: true
          });
          return;
        }

        if (userData.activeDuelId) {
          await interaction.reply({
            content: '❌ You already have an active duel.',
            ephemeral: true
          });
          return;
        }

        if (opponentData.activeDuelId) {
          await interaction.reply({
            content: `❌ **${opponent.tag}** already has an active duel.`,
            ephemeral: true
          });
          return;
        }

        const chosenDuel = pickDuelChallenge(difficulty);

        if (!chosenDuel) {
          await interaction.reply({
            content: '❌ No duel challenge is available for that difficulty.',
            ephemeral: true
          });
          return;
        }

        const duelId = makeId();
        const duel = {
          id: duelId,
          challengerId: interaction.user.id,
          opponentId: opponent.id,
          difficulty,
          challengeText: chosenDuel,
          points: DUEL_POINTS[difficulty],
          status: 'active',
          submittedBy: null,
          proofLink: null,
          proofNote: null,
          createdAt: Date.now(),
          sourceChannelId: null,
          sourceMessageId: null
        };

        data.duels[duelId] = duel;
        userData.activeDuelId = duelId;
        opponentData.activeDuelId = duelId;
        saveData();

        await interaction.reply({
          content: `⚔️ <@${interaction.user.id}> has challenged <@${opponent.id}> to a duel!`,
          embeds: [buildDuelEmbed(duel)],
          components: [buildDuelButtons(duelId)]
        });

        const replyMessage = await interaction.fetchReply().catch(() => null);

        if (replyMessage && data.duels[duelId]) {
          data.duels[duelId].sourceChannelId = replyMessage.channelId;
          data.duels[duelId].sourceMessageId = replyMessage.id;
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

        let usedTicket = false;

        if (currentChallenge.rerollUsed) {
          if ((userData.luckyRerollTickets || 0) < 1) {
            await interaction.reply({
              content: '❌ You already used your free reroll on this challenge and you do not have any **Lucky Reroll Tickets** left.\nBuy one in `/shop` to reroll again.',
              ephemeral: true
            });
            return;
          }

          userData.luckyRerollTickets -= 1;
          usedTicket = true;
        } else {
          currentChallenge.rerollUsed = true;
        }

        currentChallenge.text = newChallengeText;
        currentChallenge.createdAt = Date.now();
        currentChallenge.proofLink = null;
        currentChallenge.proofNote = null;
        userData.stats.rerolls += 1;
        saveData();

        await updateOriginalChallengeMessage(userData, currentChallenge, {
          content: usedTicket
            ? '🎲 Lucky Reroll Ticket used! Challenge rerolled!'
            : '🔄 Challenge rerolled!'
        });

        await interaction.reply({
          content: usedTicket
            ? `🎲 You used **1 Lucky Reroll Ticket** and got a new challenge.\n**Tickets left:** ${userData.luckyRerollTickets}`
            : '🔄 Your challenge was rerolled!',
          embeds: [buildChallengeEmbed(userData, currentChallenge)],
          ephemeral: true
        });

        return;
      }

    if (interaction.isButton()) {
      const [action, ...parts] = interaction.customId.split('_');

      if (action === 'buy') {
        const itemId = parts[0];
        const userId = interaction.user.id;
        const userData = ensureUser(userId);
        const item = getShopItem(itemId);

        if (!item) {
          await interaction.reply({
            content: '❌ That shop item does not exist.',
            ephemeral: true
          });
          return;
        }

        if (userData.points < item.cost) {
          await interaction.reply({
            content: `❌ You need **${item.cost}** points for **${item.name}**, but you only have **${userData.points}**.`,
            ephemeral: true
          });
          return;
        }

        userData.points -= item.cost;

        const purchaseRecord = {
          id: makeId(),
          itemId: item.id,
          itemName: item.name,
          cost: item.cost,
          purchasedAt: Date.now(),
          fulfilled: false,
          fulfilledAt: null,
          fulfilledBy: null,
          staffNote: null,
          rewardSummary: null
        };

        let mysteryRewardResult = null;

        if (item.id === 'giveaway') {
          userData.giveawayEntries += 1;
          purchaseRecord.fulfilled = true;
          purchaseRecord.fulfilledAt = Date.now();
          purchaseRecord.fulfilledBy = client.user?.id || 'system';
          purchaseRecord.staffNote = 'Automatically stored 1 bonus giveaway entry.';
          purchaseRecord.rewardSummary = '1 bonus giveaway entry';
        }

        if (item.id === 'skippass') {
          userData.luckyRerollTickets += 1;
          purchaseRecord.fulfilled = true;
          purchaseRecord.fulfilledAt = Date.now();
          purchaseRecord.fulfilledBy = client.user?.id || 'system';
          purchaseRecord.staffNote = 'Automatically stored 1 Lucky Reroll Ticket.';
          purchaseRecord.rewardSummary = '1 Lucky Reroll Ticket';
        }

        if (item.id === 'mystery') {
          mysteryRewardResult = applyMysteryBoxReward(userData);
          purchaseRecord.fulfilled = true;
          purchaseRecord.fulfilledAt = Date.now();
          purchaseRecord.fulfilledBy = client.user?.id || 'system';
          purchaseRecord.staffNote = mysteryRewardResult.staffText;
          purchaseRecord.rewardSummary = mysteryRewardResult.label;
        }

          if (item.id === 'featuredclip') {
  userData.purchaseHistory.push(purchaseRecord);
  saveData();

  const modal = new ModalBuilder()
    .setCustomId(`featuredclip_${purchaseRecord.id}`)
    .setTitle('Submit Featured Clip');

  const clipLinkInput = new TextInputBuilder()
    .setCustomId('clip_link')
    .setLabel('Clip Link')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Paste your Discord, Medal, YouTube, TikTok, or Streamable link');

  const clipNoteInput = new TextInputBuilder()
    .setCustomId('clip_note')
    .setLabel('Short Description')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Describe what happens in the clip');

  modal.addComponents(
    new ActionRowBuilder().addComponents(clipLinkInput),
    new ActionRowBuilder().addComponents(clipNoteInput)
  );

  await interaction.showModal(modal);
  return;
}

if (item.id === 'customrole') {
  userData.purchaseHistory.push(purchaseRecord);
  saveData();

  const modal = new ModalBuilder()
    .setCustomId(`customrole_${purchaseRecord.id}`)
    .setTitle('Request Custom Role');

  const roleNameInput = new TextInputBuilder()
    .setCustomId('role_name')
    .setLabel('Role Name')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Enter your custom role name');

  const roleColorInput = new TextInputBuilder()
    .setCustomId('role_color')
    .setLabel('Role Color')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setPlaceholder('Example: #ff0000');

  const roleNoteInput = new TextInputBuilder()
    .setCustomId('role_note')
    .setLabel('Extra Notes')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder('Anything staff should know');

  modal.addComponents(
    new ActionRowBuilder().addComponents(roleNameInput),
    new ActionRowBuilder().addComponents(roleColorInput),
    new ActionRowBuilder().addComponents(roleNoteInput)
  );

  await interaction.showModal(modal);
  return;
}
          
        userData.purchaseHistory.push(purchaseRecord);
        saveData();

        await interaction.update({
          embeds: [buildShopEmbed(userData, userId)],
          components: buildShopButtons(userData)
        });

        let purchasesChannel = null;

        try {
          purchasesChannel = await client.channels.fetch(PURCHASES_CHANNEL_ID);
        } catch (err) {
          console.error('Could not fetch purchases channel:', err);
        }

        if (
          purchasesChannel &&
          (purchasesChannel.type === ChannelType.GuildText ||
            purchasesChannel.type === ChannelType.PublicThread ||
            purchasesChannel.type === ChannelType.PrivateThread ||
            purchasesChannel.type === ChannelType.AnnouncementThread ||
            purchasesChannel.type === ChannelType.GuildAnnouncement)
        ) {
          const purchaseEmbed = new EmbedBuilder()
            .setTitle('🛒 New Shop Purchase')
            .setColor('Gold')
            .setDescription(`<@${interaction.user.id}> bought **${item.emoji} ${item.name}** from the StormBuddy shop.`)
            .addFields(
              { name: 'User', value: `${interaction.user.tag}`, inline: true },
              { name: 'Discord ID', value: `${interaction.user.id}`, inline: true },
              { name: 'Epic', value: userData.epic || 'Not set', inline: true },
              { name: 'Category', value: item.category, inline: true },
              { name: 'Item', value: `${item.emoji} ${item.name}`, inline: true },
              { name: 'Cost', value: `${item.cost} points`, inline: true },
              { name: 'Points Left', value: `${userData.points}`, inline: true },
              { name: 'Purchase ID', value: purchaseRecord.id, inline: true },
              {
                name: 'Status',
                value:
                  item.id === 'giveaway' || item.id === 'skippass' || item.id === 'mystery'
                    ? 'Automatically fulfilled'
                    : 'Pending staff fulfillment',
                inline: true
              },
              { name: 'Reward Details', value: item.description, inline: false },
              {
                name: 'How To Fulfill',
                value:
                  item.id === 'giveaway'
                    ? 'Bonus giveaway entry was stored automatically and will be auto-used when the buyer enters a giveaway.'
                    : item.id === 'skippass'
                    ? 'Lucky Reroll Ticket was stored automatically. The buyer can use /reroll to consume it after their free reroll is already used.'
                    : item.id === 'mystery'
                    ? `Mystery Box opened automatically.\nReward granted: **${mysteryRewardResult?.label || 'Unknown reward'}**`
                    : item.delivery,
                inline: false
              }
            )
            .setFooter({
              text:
                item.id === 'giveaway' || item.id === 'skippass' || item.id === 'mystery'
                  ? 'Automatic reward applied successfully.'
                  : 'Staff: handle the reward, then react with ✅ when done.'
            })
            .setTimestamp();

          await purchasesChannel.send({ embeds: [purchaseEmbed] }).catch(err => {
            console.error('Failed to send purchase log:', err);
          });
        } else {
          console.error('Purchases channel not found or is not a supported text channel.');
        }

        await interaction.followUp({
          content:
            item.id === 'giveaway'
              ? `✅ You bought **${item.name}** for **${item.cost}** points.\nYou now have **${userData.points}** points left.\nYour stored bonus giveaway entries are now **${userData.giveawayEntries}**.`
              : item.id === 'skippass'
              ? `✅ You bought **${item.name}** for **${item.cost}** points.\nYou now have **${userData.points}** points left.\nYour stored Lucky Reroll Tickets are now **${userData.luckyRerollTickets}**.\nUse **/reroll** when your free reroll is already used.`
              : item.id === 'mystery'
              ? `🎁 You bought **${item.name}** for **${item.cost}** points.\n${mysteryRewardResult?.publicText || 'Your reward was applied automatically.'}\nYou now have **${userData.points}** points left.\n**Bonus Giveaway Entries:** ${userData.giveawayEntries || 0}\n**Lucky Reroll Tickets:** ${userData.luckyRerollTickets || 0}`
              : `✅ You bought **${item.name}** for **${item.cost}** points.\nYou now have **${userData.points}** points left.\nYour purchase was logged for staff. Reward delivery: **${item.delivery}**`,
          ephemeral: true
        });

        return;
      }

      if (action === 'givejoin') {
        const giveawayId = parts[0];
        const giveaway = getGiveawayById(giveawayId);

        if (!giveaway) {
          await interaction.reply({
            content: '❌ That giveaway no longer exists.',
            ephemeral: true
          });
          return;
        }

        if (giveaway.status === 'ended') {
          await interaction.reply({
            content: '❌ This giveaway already ended.',
            ephemeral: true
          });
          return;
        }

        const userData = ensureUser(interaction.user.id);

        if (giveaway.entries[interaction.user.id]) {
          const existingEntry = giveaway.entries[interaction.user.id];
          const bonusUsed = Math.max(0, existingEntry.bonusEntriesUsed || 0);
          const totalEntries = Math.max(1, existingEntry.totalEntries || (1 + bonusUsed));

          await interaction.reply({
            content: bonusUsed > 0
              ? `ℹ️ You are already entered.\n**Bonus Giveaway Entries:** ${userData.giveawayEntries || 0}\n**Bonus Entries Being Used:** ${bonusUsed}\n**Total Entries In This Giveaway:** ${totalEntries}`
              : `ℹ️ You are already entered.\nYour total weight for this giveaway is **${totalEntries}** entry${totalEntries === 1 ? '' : 'ies'}.`,
            ephemeral: true
          });
          return;
        }

        const storedBonusEntries = Math.max(0, userData.giveawayEntries || 0);
        const totalEntries = 1 + storedBonusEntries;

        giveaway.entries[interaction.user.id] = {
          enteredAt: Date.now(),
          bonusEntriesUsed: storedBonusEntries,
          totalEntries
        };

        if (storedBonusEntries > 0) {
          userData.giveawayEntries = 0;
        }

        saveData();

        await updateGiveawayMessage(giveaway);

        await interaction.reply({
          content: storedBonusEntries > 0
            ? `✅ You entered the giveaway for **${giveaway.prize}**.\n**Bonus Giveaway Entries:** ${userData.giveawayEntries || 0}\n**Bonus Entries Being Used:** ${storedBonusEntries}\n**Total Entries In This Giveaway:** ${totalEntries}`
            : `✅ You entered the giveaway for **${giveaway.prize}**.\nYour total weight for this giveaway is **${totalEntries}** entry${totalEntries === 1 ? '' : 'ies'}.`,
          ephemeral: true
        });
        return;
      }

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

      if (action === 'duelsubmit') {
        const duelId = parts[0];
        const duel = getDuelById(duelId);

        if (!duel) {
          await interaction.reply({
            content: '❌ That duel no longer exists.',
            ephemeral: true
          });
          return;
        }

        if (duel.status !== 'active') {
          await interaction.reply({
            content: '❌ This duel is not accepting proof right now.',
            ephemeral: true
          });
          return;
        }

        if (![duel.challengerId, duel.opponentId].includes(interaction.user.id)) {
          await interaction.reply({
            content: '❌ Only duel participants can submit proof.',
            ephemeral: true
          });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId(`duelproofmodal_${duelId}`)
          .setTitle('Submit Duel Proof');

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
          .setPlaceholder('Example: 6 kills, placed 4th, beat the other player');

        const row1 = new ActionRowBuilder().addComponents(proofLinkInput);
        const row2 = new ActionRowBuilder().addComponents(proofNoteInput);

        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
        return;
      }

      if (action === 'duelcancel') {
        const duelId = parts[0];
        const duel = getDuelById(duelId);

        if (!duel) {
          await interaction.reply({
            content: '❌ That duel no longer exists.',
            ephemeral: true
          });
          return;
        }

        if (interaction.user.id !== duel.challengerId && interaction.user.id !== duel.opponentId && !isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only duel participants or staff can cancel this duel.',
            ephemeral: true
          });
          return;
        }

        duel.status = 'cancelled';
        saveData();

        await updateOriginalDuelMessage(duel, {
          content: '❌ Duel cancelled.',
          components: [buildDuelButtons(duel.id, false, true)]
        });

        clearUserActiveDuel(duel.challengerId, duel.id);
        clearUserActiveDuel(duel.opponentId, duel.id);
        saveData();

        await interaction.update({
          content: '❌ Duel cancelled.',
          embeds: [],
          components: []
        });

        return;
      }

      if (action === 'lfgjoin') {
        const hostId = parts[0];

        if (interaction.user.id === hostId) {
          await interaction.reply({
            content: '❌ You are the host of this LFG post.',
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          content: `✅ You joined this LFG. <@${hostId}>, <@${interaction.user.id}> wants to squad up.`,
          ephemeral: false
        });
        return;
      }

      if (action === 'lfginterested') {
        const hostId = parts[0];

        if (interaction.user.id === hostId) {
          await interaction.reply({
            content: '❌ You are the host of this LFG post.',
            ephemeral: true
          });
          return;
        }

        await interaction.reply({
          content: `👀 <@${interaction.user.id}> is interested in teaming with <@${hostId}>.`,
          ephemeral: false
        });
        return;
      }

      if (action === 'lfgfull') {
        const hostId = parts[0];

        if (interaction.user.id !== hostId && !isStaff(interaction.member)) {
          await interaction.reply({
            content: '❌ Only the host or staff can mark this LFG as full.',
            ephemeral: true
          });
          return;
        }

        await interaction.update({
          components: [buildLfgButtons(hostId, true)]
        });

        await interaction.followUp({
          content: `🚫 This LFG is now full.`,
          ephemeral: false
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

      if (action === 'duelwin') {
        const modMember = interaction.member;

        if (!isStaff(modMember)) {
          await interaction.reply({
            content: '❌ You need Manage Server or Administrator to do that.',
            ephemeral: true
          });
          return;
        }

        const duelId = parts[0];
        const winnerId = parts[1];
        const duel = getDuelById(duelId);

        if (!duel) {
          await interaction.reply({
            content: '❌ That duel no longer exists.',
            ephemeral: true
          });
          return;
        }

        if (!['active', 'pending'].includes(duel.status)) {
          await interaction.reply({
            content: '❌ That duel has already been resolved.',
            ephemeral: true
          });
          return;
        }

        if (![duel.challengerId, duel.opponentId].includes(winnerId)) {
          await interaction.reply({
            content: '❌ Invalid duel winner.',
            ephemeral: true
          });
          return;
        }

        const loserId = winnerId === duel.challengerId ? duel.opponentId : duel.challengerId;
        const winnerData = ensureUser(winnerId);
        const loserData = ensureUser(loserId);

        winnerData.points += duel.points;
        winnerData.stats.duelWins += 1;
        loserData.stats.duelLosses += 1;

        duel.status = 'completed';
        duel.winnerId = winnerId;
        duel.completedAt = Date.now();
        saveData();

        await updateOriginalDuelMessage(duel, {
          content: `🏆 <@${winnerId}> won this duel and earned **${duel.points}** points!`,
          components: [buildDuelButtons(duel.id, true, true)]
        });

        clearUserActiveDuel(duel.challengerId, duel.id);
        clearUserActiveDuel(duel.opponentId, duel.id);
        saveData();

        const winnerUser = await client.users.fetch(winnerId).catch(() => null);
        const loserUser = await client.users.fetch(loserId).catch(() => null);

        const resultEmbed = new EmbedBuilder()
          .setTitle('🏆 Duel Result')
          .setColor('Green')
          .setDescription(`<@${winnerId}> won the duel and earned **${duel.points}** points.`)
          .addFields(
            { name: 'Challenge', value: duel.challengeText, inline: false },
            { name: 'Winner', value: `<@${winnerId}>`, inline: true },
            { name: 'Loser', value: `<@${loserId}>`, inline: true },
            { name: 'Difficulty', value: duel.difficulty.toUpperCase(), inline: true }
          )
          .setFooter({ text: `Reviewed by ${interaction.user.tag}` });

        await interaction.update({
          embeds: [resultEmbed],
          components: [buildDuelReviewButtons(duel.id, duel.challengerId, duel.opponentId, true)]
        });

        if (winnerUser) {
          const dmEmbed = new EmbedBuilder()
            .setTitle('🏆 You won your duel')
            .setColor('Green')
            .setDescription(`You won your duel in **Crash & Play Lounge** and earned **${duel.points}** points.`)
            .addFields(
              { name: 'Challenge', value: duel.challengeText, inline: false },
              { name: 'Points Earned', value: `${duel.points}`, inline: true },
              { name: 'Total Points', value: `${winnerData.points}`, inline: true }
            )
            .setFooter({ text: `Approved by ${interaction.user.tag}` })
            .setTimestamp();

          await winnerUser.send({ embeds: [dmEmbed] }).catch(() => null);
        }

        if (loserUser) {
          const dmEmbed = new EmbedBuilder()
            .setTitle('⚔️ Duel finished')
            .setColor('Red')
            .setDescription(`Your duel in **Crash & Play Lounge** has been reviewed.`)
            .addFields(
              { name: 'Challenge', value: duel.challengeText, inline: false },
              { name: 'Winner', value: winnerUser ? winnerUser.tag : winnerId, inline: true },
              { name: 'Reviewed by', value: interaction.user.tag, inline: true }
            )
            .setTimestamp();

          await loserUser.send({ embeds: [dmEmbed] }).catch(() => null);
        }

        return;
      }

      if (action === 'duelreviewcancel') {
        const modMember = interaction.member;

        if (!isStaff(modMember)) {
          await interaction.reply({
            content: '❌ You need Manage Server or Administrator to do that.',
            ephemeral: true
          });
          return;
        }

        const duelId = parts[0];
        const duel = getDuelById(duelId);

        if (!duel) {
          await interaction.reply({
            content: '❌ That duel no longer exists.',
            ephemeral: true
          });
          return;
        }

        duel.status = 'cancelled';
        saveData();

        await updateOriginalDuelMessage(duel, {
          content: '❌ Duel cancelled by staff.',
          components: [buildDuelButtons(duel.id, false, true)]
        });

        clearUserActiveDuel(duel.challengerId, duel.id);
        clearUserActiveDuel(duel.opponentId, duel.id);
        saveData();

        const cancelledEmbed = new EmbedBuilder()
          .setTitle('❌ Duel Cancelled')
          .setColor('Red')
          .setDescription('This duel was cancelled by staff.')
          .addFields(
            { name: 'Challenge', value: duel.challengeText, inline: false },
            { name: 'Challenger', value: `<@${duel.challengerId}>`, inline: true },
            { name: 'Opponent', value: `<@${duel.opponentId}>`, inline: true }
          )
          .setFooter({ text: `Cancelled by ${interaction.user.tag}` });

        await interaction.update({
          embeds: [cancelledEmbed],
          components: [buildDuelReviewButtons(duel.id, duel.challengerId, duel.opponentId, true)]
        });

        return;
      }
    }

    if (interaction.isModalSubmit()) {
      const [modalType, id] = interaction.customId.split('_');

      if (modalType === 'featuredclip') {
  await interaction.deferReply({ ephemeral: true });

  const purchaseId = id;
  const clipLink = interaction.fields.getTextInputValue('clip_link');
  const clipNote = interaction.fields.getTextInputValue('clip_note');
  const userData = ensureUser(interaction.user.id);

  const purchase = userData.purchaseHistory.find(p => p.id === purchaseId);

  if (!purchase || purchase.itemId !== 'featuredclip') {
    await interaction.editReply({
      content: '❌ That featured clip purchase could not be found.'
    });
    return;
  }

  let purchasesChannel = null;

  try {
    purchasesChannel = await client.channels.fetch(PURCHASES_CHANNEL_ID);
  } catch (err) {
    console.error('Could not fetch purchases channel:', err);
  }

  if (purchasesChannel && isSupportedTextChannel(purchasesChannel)) {
    const embed = new EmbedBuilder()
      .setTitle('📹 Featured Clip Submission')
      .setColor('Purple')
      .setDescription(`<@${interaction.user.id}> submitted their featured clip purchase.`)
      .addFields(
        { name: 'User', value: interaction.user.tag, inline: true },
        { name: 'Epic', value: userData.epic || 'Not set', inline: true },
        { name: 'Purchase ID', value: purchaseId, inline: true },
        { name: 'Clip Link', value: clipLink, inline: false },
        { name: 'Description', value: clipNote, inline: false }
      )
      .setTimestamp();

    await purchasesChannel.send({ embeds: [embed] });
  }

  await interaction.editReply({
    content: '✅ Your featured clip was submitted for staff review.'
  });

  return;
}

if (modalType === 'customrole') {
  await interaction.deferReply({ ephemeral: true });

  const purchaseId = id;
  const roleName = interaction.fields.getTextInputValue('role_name');
  const roleColor = interaction.fields.getTextInputValue('role_color');
  const roleNote = interaction.fields.getTextInputValue('role_note') || 'None';
  const userData = ensureUser(interaction.user.id);

  const purchase = userData.purchaseHistory.find(p => p.id === purchaseId);

  if (!purchase || purchase.itemId !== 'customrole') {
    await interaction.editReply({
      content: '❌ That custom role purchase could not be found.'
    });
    return;
  }

  let purchasesChannel = null;

  try {
    purchasesChannel = await client.channels.fetch(PURCHASES_CHANNEL_ID);
  } catch (err) {
    console.error('Could not fetch purchases channel:', err);
  }

  if (purchasesChannel && isSupportedTextChannel(purchasesChannel)) {
    const embed = new EmbedBuilder()
      .setTitle('✨ Custom Role Request')
      .setColor('Blue')
      .setDescription(`<@${interaction.user.id}> submitted their custom role request.`)
      .addFields(
        { name: 'User', value: interaction.user.tag, inline: true },
        { name: 'Epic', value: userData.epic || 'Not set', inline: true },
        { name: 'Purchase ID', value: purchaseId, inline: true },
        { name: 'Role Name', value: roleName, inline: false },
        { name: 'Role Color', value: roleColor, inline: false },
        { name: 'Notes', value: roleNote, inline: false }
      )
      .setTimestamp();

    await purchasesChannel.send({ embeds: [embed] });
  }

  await interaction.editReply({
    content: '✅ Your custom role request was sent to staff.'
  });

  return;
}
      
      if (modalType === 'proofmodal') {
        await interaction.deferReply({ ephemeral: true });

        const challengeId = id;
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
          reviewChannel.type !== ChannelType.AnnouncementThread &&
          reviewChannel.type !== ChannelType.GuildAnnouncement
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

        return;
      }

      if (modalType === 'duelproofmodal') {
        await interaction.deferReply({ ephemeral: true });

        const duelId = id;
        const duel = getDuelById(duelId);

        if (!duel) {
          await interaction.editReply({
            content: '❌ That duel no longer exists.'
          });
          return;
        }

        if (!['active', 'pending'].includes(duel.status)) {
          await interaction.editReply({
            content: '❌ That duel is no longer active.'
          });
          return;
        }

        if (![duel.challengerId, duel.opponentId].includes(interaction.user.id)) {
          await interaction.editReply({
            content: '❌ Only duel participants can submit proof.'
          });
          return;
        }

        const proofLink = interaction.fields.getTextInputValue('proof_link');
        const proofNote = interaction.fields.getTextInputValue('proof_note');

        duel.status = 'pending';
        duel.submittedBy = interaction.user.id;
        duel.proofLink = proofLink;
        duel.proofNote = proofNote;
        saveData();

        await updateOriginalDuelMessage(duel, {
          content: '⏳ Duel proof submitted. Waiting for staff review.',
          components: [buildDuelButtons(duel.id, true, false)]
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
          reviewChannel.type !== ChannelType.AnnouncementThread &&
          reviewChannel.type !== ChannelType.GuildAnnouncement
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

        const challengerData = ensureUser(duel.challengerId);
        const opponentData = ensureUser(duel.opponentId);

        const reviewEmbed = new EmbedBuilder()
          .setTitle('⚔️ Duel Proof Submitted')
          .setColor('Orange')
          .setDescription(`<@${interaction.user.id}> submitted duel proof for review.`)
          .addFields(
            { name: 'Challenger', value: `<@${duel.challengerId}>`, inline: true },
            { name: 'Opponent', value: `<@${duel.opponentId}>`, inline: true },
            { name: 'Difficulty', value: duel.difficulty.toUpperCase(), inline: true },
            { name: 'Challenger Epic', value: challengerData.epic || 'Not set', inline: true },
            { name: 'Opponent Epic', value: opponentData.epic || 'Not set', inline: true },
            { name: 'Reward', value: `${duel.points} points`, inline: true },
            { name: 'Challenge', value: duel.challengeText, inline: false },
            { name: 'Submitted By', value: interaction.user.tag, inline: true },
            { name: 'Proof Link', value: proofLink, inline: false },
            { name: 'Player Note', value: proofNote, inline: false }
          )
          .setTimestamp();

        await reviewChannel.send({
          embeds: [reviewEmbed],
          components: [buildDuelReviewButtons(duel.id, duel.challengerId, duel.opponentId)]
        });

        await interaction.editReply({
          content: '✅ Duel proof submitted successfully! Waiting for mod review.'
        });

        return;
      }
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
