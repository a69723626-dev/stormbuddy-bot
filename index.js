// ONLY showing the FIXED PART (modal section)
// KEEP EVERYTHING ELSE THE SAME

if (interaction.isModalSubmit()) {
  const [modalType, challengeId] = interaction.customId.split('_');

  if (modalType !== 'proofmodal') return;

  // ✅ CRITICAL FIX (prevents "Something went wrong")
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

  const reviewChannel =
    interaction.guild.channels.cache.get(REVIEW_CHANNEL_ID);

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
