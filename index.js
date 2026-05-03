const {
  Client,
  GatewayIntentBits,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');
const { REST } = require('@discordjs/rest');

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const staffRoleId = process.env.STAFF_ROLE_ID;
const ticketCategoryId = process.env.TICKET_CATEGORY_ID;
const panelChannelId = process.env.PANEL_CHANNEL_ID;
const welcomeChannelId = process.env.WELCOME_CHANNEL_ID;
const leaveChannelId = process.env.LEAVE_CHANNEL_ID;
const verifyChannelId = process.env.VERIFY_CHANNEL_ID;
const verificationRoleId = process.env.VERIFICATION_ROLE_ID;

if (!token || !clientId || !guildId || !staffRoleId) {
  console.error('Errore: assicurati che TOKEN, CLIENT_ID, GUILD_ID e STAFF_ROLE_ID siano impostati.');
  process.exit(1);
}

if (!ticketCategoryId) {
  console.warn('ATTENZIONE: TICKET_CATEGORY_ID non impostato. Le categorie ticket verranno create alla radice del server.');
}

if (verifyChannelId && !verificationRoleId) {
  console.warn('ATTENZIONE: VERIFY_CHANNEL_ID impostato ma VERIFICATION_ROLE_ID manca. La verifica non assegnerà alcun ruolo.');
}

const ticketCategories = [
  { id: 'partner', label: 'PARTNER', emoji: '🤝' },
  { id: 'generale', label: 'GENERALE', emoji: '💬' },
  { id: 'unban', label: 'UNBAN', emoji: '🛡️' },
  { id: 'bug', label: 'BUG', emoji: '🐞' },
  { id: 'donazione', label: 'DONAZIONE', emoji: '🎁' },
  { id: 'owner', label: 'OWNER', emoji: '👑' },
  { id: 'tournament', label: 'TOURNAMENT', emoji: '🏆' },
];

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages],
});

client.once('ready', async () => {
  console.log(`Bot pronto! Logged in as ${client.user.tag}`);

  await registerCommands();

  if (panelChannelId) {
    try {
      const channel = await client.channels.fetch(panelChannelId);
      if (channel && channel.isTextBased()) {
        if (!(await panelAlreadyExists(channel, '🎟️ CIAO UTENTE DI HYPE PVP', 'ticket:partner'))) {
          await channel.send({ embeds: [createPanelEmbed()], components: createPanelButtons() });
          console.log(`Pannello ticket inviato su <#${panelChannelId}>.`);
        }
      }
    } catch (error) {
      console.warn('Impossibile inviare automaticamente il pannello ticket:', error.message);
    }
  }

  if (verifyChannelId) {
    await sendVerifyPanel();
  }
});

client.on('guildMemberAdd', async (member) => {
  if (!welcomeChannelId) return;

  const channel = await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const count = member.guild.memberCount;
  channel.send(`SALVE <@${member.id}> BENVENUTO IN HYPE PVP, SEI IL ${count} membro.`).catch(() => null);
});

client.on('guildMemberRemove', async (member) => {
  if (!leaveChannelId) return;

  const channel = await member.guild.channels.fetch(leaveChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  const count = member.guild.memberCount;
  channel.send(`${member.user.tag} è uscito adesso siamo in ${count} membri.`).catch(() => null);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ticketpanel') {
        await interaction.reply({ content: 'Pannello ticket inviato.', ephemeral: true });
        await interaction.channel.send({ embeds: [createPanelEmbed()], components: createPanelButtons() });
      }
      return;
    }

    if (interaction.isButton()) {
      const [action, categoryId] = interaction.customId.split(':');

      if (action === 'ticket') {
        return await handleTicketOpen(interaction, categoryId);
      }

      if (action === 'close') {
        return await handleCloseButton(interaction);
      }

      if (action === 'claim') {
        return await handleTicketClaim(interaction);
      }

      if (action === 'verify') {
        return await handleVerifyButton(interaction);
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'close:submit') {
        return await handleCloseModalSubmit(interaction);
      }
    }
  } catch (error) {
    console.error('Errore durante l\'interazione:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Si è verificato un errore.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Si è verificato un errore.', ephemeral: true });
    }
  }
});

async function registerCommands() {
  const commands = [
    {
      name: 'ticketpanel',
      description: 'Invia il pannello ticket in questo canale',
    },
  ];

  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log('Comandi slash registrati.');
}

function createPanelEmbed() {
  return new EmbedBuilder()
    .setTitle('🎟️ CIAO UTENTE DI HYPE PVP')
    .setDescription(
      '✨ PER QUALSIASI PROBLEMA APRI IL TICKET CHE TI SERVE ✨\n\n' +
      '🏷️ Scegli la categoria giusta e attendi lo staff. Solo tu e lo staff potranno vedere il ticket.\n' +
      '📌 Ricorda: puoi avere solo un ticket aperto alla volta.'
    )
    .setColor('#2f3136')
    .setFooter({ text: 'HYPE PVP | Ticket System' });
}

function createPanelButtons() {
  const rows = [];
  const firstRow = new ActionRowBuilder();
  const secondRow = new ActionRowBuilder();

  ticketCategories.slice(0, 4).forEach((category) => {
    firstRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:${category.id}`)
        .setLabel(category.label)
        .setEmoji(category.emoji)
        .setStyle(ButtonStyle.Primary)
    );
  });

  ticketCategories.slice(4).forEach((category) => {
    secondRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:${category.id}`)
        .setLabel(category.label)
        .setEmoji(category.emoji)
        .setStyle(ButtonStyle.Secondary)
    );
  });

  rows.push(firstRow, secondRow);
  return rows;
}

function createVerifyEmbed() {
  return new EmbedBuilder()
    .setTitle('Verifica Utente')
    .setDescription('Premi il pulsante qui sotto per verificare che tu non sia un bot e ricevere il ruolo di accesso.')
    .setColor('#57f287');
}

function createVerifyButton() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('verify:confirm')
      .setLabel('Verificami')
      .setStyle(ButtonStyle.Success)
  );
}

async function sendVerifyPanel() {
  if (!verifyChannelId) return;

  const channel = await client.channels.fetch(verifyChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;

  if (await panelAlreadyExists(channel, 'Verifica Utente', 'verify:confirm')) return;

  await channel.send({ embeds: [createVerifyEmbed()], components: [createVerifyButton()] }).catch(() => null);
}

async function panelAlreadyExists(channel, embedTitle, buttonCustomId) {
  const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!messages) return false;

  return messages.some((message) => {
    if (message.embeds.some((embed) => embed.title === embedTitle)) return true;
    return message.components.some((row) =>
      row.components.some((component) => component.customId === buttonCustomId)
    );
  });
}

async function handleVerifyButton(interaction) {
  const member = interaction.member;
  if (!member || member.user.bot) {
    return interaction.reply({ content: 'I bot non possono essere verificati.', ephemeral: true });
  }

  if (!verificationRoleId) {
    return interaction.reply({ content: 'Ruolo di verifica non configurato. Contatta un amministratore.', ephemeral: true });
  }

  const alreadyHasRole = member.roles.cache.has(verificationRoleId);
  if (alreadyHasRole) {
    return interaction.reply({ content: 'Sei già verificato.', ephemeral: true });
  }

  try {
    const role = await interaction.guild.roles.fetch(verificationRoleId).catch(() => null);
    if (!role) {
      return interaction.reply({ content: 'Ruolo di verifica non trovato. Contatta un amministratore.', ephemeral: true });
    }

    const botMember = await interaction.guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      console.error('Bot non ha il permesso ManageRoles');
      return interaction.reply({ content: 'Il bot non ha il permesso per assegnare ruoli.', ephemeral: true });
    }

    if (botMember.roles.highest.position <= role.position) {
      console.error(`Ruolo ${role.name} è più alto o uguale al ruolo del bot`);
      return interaction.reply({ content: `Il ruolo ${role.name} è troppo alto nella gerarchia. Sposta il bot più in alto.`, ephemeral: true });
    }

    await member.roles.add(verificationRoleId);
    return interaction.reply({ content: `Verifica completata! Ti è stato assegnato il ruolo ${role.name}.`, ephemeral: true });
  } catch (error) {
    console.error('Errore durante l\'assegnazione del ruolo di verifica:', error.message || error);
    console.error('Dettagli:', {
      userId: member.id,
      roleId: verificationRoleId,
      guildId: interaction.guild.id,
      botPermissions: interaction.guild.members.me?.permissions.toArray()
    });
    return interaction.reply({ content: `Errore durante l'assegnazione del ruolo: ${error.message}`, ephemeral: true });
  }
}

function createTicketEmbed(user, category) {
  return new EmbedBuilder()
    .setTitle(`Ticket aperto: ${category.label}`)
    .setDescription(
      `Ciao ${user}, descrivi il tuo problema bene, uno staff ti assisterà a breve.`
    )
    .addFields(
      { name: 'Categoria', value: category.label, inline: true },
      { name: 'Richiedente', value: `${user.tag}`, inline: true }
    )
    .setColor('#5865f2')
    .setTimestamp();
}

function createTicketActions() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim:ticket')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('close:modal')
      .setLabel('Chiudi Ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

async function getOrCreateTypeCategory(guild, category) {
  const categoryName = `ticket-${category.id}`;
  const existingCategory = guild.channels.cache.find(
    (channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === categoryName
  );

  if (existingCategory) {
    return existingCategory.id;
  }

  const createdCategory = await guild.channels.create({
    name: categoryName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  return createdCategory.id;
}

function createCloseModal() {
  const modal = new ModalBuilder()
    .setCustomId('close:submit')
    .setTitle('Chiudi ticket');

  const reasonInput = new TextInputBuilder()
    .setCustomId('closeReason')
    .setLabel('Motivazione della chiusura')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setPlaceholder('Scrivi perché stai chiudendo il ticket...');

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

async function handleTicketOpen(interaction, categoryId) {
  await interaction.deferReply({ ephemeral: true });

  const category = ticketCategories.find((item) => item.id === categoryId);
  if (!category) {
    return interaction.editReply({ content: 'Categoria ticket non valida.' });
  }

  const existingChannel = interaction.guild.channels.cache.find((channel) => {
    return (
      channel.topic?.includes(`TicketOwnerID:${interaction.user.id}`) &&
      !channel.name.endsWith('-chiuso')
    );
  });

  if (existingChannel) {
    return interaction.editReply({
      content: `Hai già un ticket aperto: <#${existingChannel.id}>`,
    });
  }

  const typeCategoryId = await getOrCreateTypeCategory(interaction.guild, category);
  const cleanUsername = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const channelName = `${cleanUsername}-${category.id}`.slice(0, 90);

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: typeCategoryId,
    topic: `TicketOwnerID:${interaction.user.id} | Categoria:${category.label}`,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: staffRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ],
  });

  await channel.send({ embeds: [createTicketEmbed(interaction.user, category)], components: [createTicketActions()] });

  return interaction.editReply({
    content: `Il tuo ticket è stato creato: <#${channel.id}>`,
  });
}

async function handleCloseButton(interaction) {
  const channel = interaction.channel;
  if (!channel || !channel.topic?.includes('TicketOwnerID:')) {
    return interaction.reply({ content: 'Questo comando può essere usato solo in un ticket.', ephemeral: true });
  }

  const isStaff = interaction.member.roles.cache.has(staffRoleId);
  if (!isStaff) {
    return interaction.reply({ content: 'Solo lo staff può chiudere questo ticket.', ephemeral: true });
  }

  return interaction.showModal(createCloseModal());
}

async function handleCloseModalSubmit(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const channel = interaction.channel;
  const ownerId = channel.topic.split('TicketOwnerID:')[1].split(' |')[0];
  const reason = interaction.fields.getTextInputValue('closeReason');

  await closeTicket(channel, ownerId, interaction.user, reason);
  await interaction.editReply({ content: 'Ticket chiuso con successo.' });
}

async function handleTicketClaim(interaction) {
  const channel = interaction.channel;
  if (!channel || !channel.topic?.includes('TicketOwnerID:')) {
    return interaction.reply({ content: 'Questo comando può essere usato solo in un ticket.', ephemeral: true });
  }

  const isStaff = interaction.member.roles.cache.has(staffRoleId);
  if (!isStaff) {
    return interaction.reply({ content: 'Solo lo staff può prendere in gestione questo ticket.', ephemeral: true });
  }

  const ownerId = channel.topic.split('TicketOwnerID:')[1].split(' |')[0];
  const owner = await interaction.guild.members.fetch(ownerId).catch(() => null);
  await channel.send({ content: `🔧 <@${ownerId}> il ticket è stato preso in gestione da ${interaction.user}.` });
  return interaction.reply({ content: 'Hai preso in gestione questo ticket.', ephemeral: true });
}

async function closeTicket(channel, ownerId, closer, reason) {
  const owner = await channel.guild.members.fetch(ownerId).catch(() => null);
  const messages = await channel.messages.fetch({ limit: 100 });
  const transcript = messages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => {
      const author = `${message.author.tag}`;
      const time = new Date(message.createdTimestamp).toLocaleString('it-IT');
      const content = message.content || '';
      const attachments = message.attachments.size > 0 ? ` [ALLEGATI: ${message.attachments.map((a) => a.url).join(', ')}]` : '';
      return `[${time}] ${author}: ${content}${attachments}`;
    })
    .join('\n');

  const transcriptFile = new AttachmentBuilder(Buffer.from(transcript || 'Nessun messaggio.', 'utf-8'), {
    name: `${channel.name}-transcript.txt`,
  });

  const category = channel.parent;
  const closeMessage = `Ticket chiuso da ${closer}. Motivazione: ${reason}`;
  await channel.send({ content: closeMessage }).catch(() => null);

  if (owner) {
    await owner.send({
      content: `Il tuo ticket ${channel.name} è stato chiuso. Ecco la trascrizione completa:`,
      files: [transcriptFile],
    }).catch(() => null);
  }

  await channel.delete().catch(() => null);

  if (category) {
    const remainingTextChannels = category.children.filter((child) => child.type === ChannelType.GuildText && child.id !== channel.id);
    if (remainingTextChannels.size === 0) {
      await category.delete().catch(() => null);
    }
  }
}

client.login(token);
