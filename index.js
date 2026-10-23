
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = path.join(__dirname, 'football-data.json');
const STARTING_BUDGET = 1_000_000;
const TRAINING_COOLDOWN = 12 * 60 * 60 * 1000;

const HEAD_STAFF_IDS = (process.env.HEAD_STAFF_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

const POSITIONS = [
    { name: 'Normal', value: 'normal' },
    { name: 'Delantero', value: 'delantero' },
    { name: 'Mediocampista', value: 'mediocampista' },
    { name: 'Defensa', value: 'defensa' },
    { name: 'Portero', value: 'portero' }
];

const TRAININGS = [
    { name: 'Control de balón', value: 'control', stats: ['control'] },
    { name: 'Tiros a puerta', value: 'tiros', stats: ['tiro', 'definicion'] },
    { name: 'Velocidad', value: 'velocidad', stats: ['velocidad'] },
    { name: 'Aceleración', value: 'aceleracion', stats: ['aceleracion'] },
    { name: 'Visión de juego', value: 'vision', stats: ['vision', 'pase'] },
    { name: 'Precisión de pase', value: 'pases', stats: ['pase', 'control'] },
    { name: 'Defensa', value: 'defensa', stats: ['defensa'] },
    { name: 'Entrenamiento físico', value: 'fisico', stats: ['fisico', 'velocidad'] },
    { name: 'Definición', value: 'definicion', stats: ['definicion', 'tiro'] },
    { name: 'Reflejos', value: 'reflejos', stats: ['reflejos'] }
];

const STAT_NAMES = {
    control: 'Control',
    tiro: 'Tiro',
    velocidad: 'Velocidad',
    aceleracion: 'Aceleración',
    vision: 'Visión',
    pase: 'Pase',
    defensa: 'Defensa',
    fisico: 'Físico',
    definicion: 'Definición',
    reflejos: 'Reflejos'
};

const POSITION_BONUSES = {
    normal: [],
    delantero: ['tiro', 'definicion', 'velocidad', 'aceleracion'],
    mediocampista: ['pase', 'vision', 'control'],
    defensa: ['defensa', 'fisico'],
    portero: ['reflejos', 'defensa']
};

const BASE_STATS = {
    control: 10,
    tiro: 10,
    velocidad: 10,
    aceleracion: 10,
    vision: 10,
    pase: 10,
    defensa: 10,
    fisico: 10,
    definicion: 10,
    reflejos: 10
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

            return {
                players: loaded.players || {},
                teams: loaded.teams || {},
                offers: loaded.offers || {}
            };
        }
    } catch (error) {
        console.error('Error leyendo la base de datos:', error);
    }

    return { players: {}, teams: {}, offers: {} };
}

const data = loadData();

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function money(amount) {
    return new Intl.NumberFormat('es-PE', {
        style: 'decimal',
        maximumFractionDigits: 0
    }).format(amount) + ' monedas';
}

function positionName(position) {
    return POSITIONS.find(p => p.value === position)?.name || 'Normal';
}

function getPlayer(user) {
    if (!data.players[user.id]) {
        data.players[user.id] = {
            id: user.id,
            name: user.username,
            position: 'normal',
            teamId: null,
            stats: { ...BASE_STATS },
            lastTraining: 0,
            trainingCount: 0,
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            goals: 0
        };
    }

    data.players[user.id].name = user.username;
    return data.players[user.id];
}

function getTeamByMember(userId) {
    return Object.values(data.teams).find(team =>
        team.members.includes(userId)
    );
}

function getTeam(userId) {
    const team = getTeamByMember(userId);
    return team || null;
}

function overall(stats) {
    const values = Object.values(stats);
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function hasPositionBonus(position, stat) {
    return (POSITION_BONUSES[position] || []).includes(stat);
}

function removeFromTeam(userId) {
    for (const team of Object.values(data.teams)) {
        team.members = team.members.filter(id => id !== userId);

        if (team.captainId === userId) {
            team.captainId = team.managerId === userId
                ? null
                : team.managerId;
        }

        if (team.managerId === userId) {
            team.managerId = null;
        }
    }

    for (const [teamId, team] of Object.entries(data.teams)) {
        if (team.members.length === 0) {
            delete data.teams[teamId];
        }
    }

    if (data.players[userId]) {
        data.players[userId].teamId = null;
    }
}

function getPlayerTeamName(userId) {
    return getTeam(userId)?.name || 'Jugador libre';
}

function buildCommands() {
    return [
        new SlashCommandBuilder()
            .setName('jugador')
            .setDescription('Crea tu jugador')
            .addSubcommand(sub =>
                sub.setName('crear')
                    .setDescription('Crea tu jugador y elige una posición')
                    .addStringOption(option =>
                        option.setName('posicion')
                            .setDescription('Posición del jugador')
                            .setRequired(true)
                            .addChoices(...POSITIONS)
                    )
            ),

        new SlashCommandBuilder()
            .setName('perfil')
            .setDescription('Consulta las estadísticas de un jugador')
            .addUserOption(option =>
                option.setName('usuario')
                    .setDescription('Jugador que quieres consultar')
                    .setRequired(false)
            ),

        new SlashCommandBuilder()
            .setName('entrenar')
            .setDescription('Entrena a tu jugador')
            .addStringOption(option =>
                option.setName('tipo')
                    .setDescription('Tipo de entrenamiento')
                    .setRequired(true)
                    .addChoices(...TRAININGS.map(t => ({
                        name: t.name,
                        value: t.value
                    })))
            ),

        new SlashCommandBuilder()
            .setName('equipo')
            .setDescription('Gestiona tu equipo')
            .addSubcommand(sub =>
                sub.setName('crear')
                    .setDescription('Crea un equipo')
                    .addStringOption(option =>
                        option.setName('nombre')
                            .setDescription('Nombre del equipo')
                            .setRequired(true)
                            .setMaxLength(40)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('fichar')
                    .setDescription('Fichar a un jugador libre')
                    .addUserOption(option =>
                        option.setName('jugador')
                            .setDescription('Jugador que quieres fichar')
                            .setRequired(true)
                    )
            )
            .addSubcommand(sub =>
                sub.setName('cargo')
                    .setDescription('Asignar capitán o manager')
                    .addUserOption(option =>
                        option.setName('jugador')
                            .setDescription('Jugador del equipo')
                            .setRequired(true)
                    )
                    .addStringOption(option =>
                        option.setName('cargo')
                            .setDescription('Cargo que se asignará')
                            .setRequired(true)
                            .addChoices(
                                { name: 'Capitán', value: 'capitan' },
                                { name: 'Manager', value: 'manager' }
                            )
                    )
            )
            .addSubcommand(sub =>
                sub.setName('info')
                    .setDescription('Consulta la información de tu equipo')
            ),

        new SlashCommandBuilder()
            .setName('simular')
            .setDescription('Simula un partido entre dos jugadores')
            .addUserOption(option =>
                option.setName('jugador1')
                    .setDescription('Primer jugador')
                    .setRequired(true)
            )
            .addUserOption(option =>
                option.setName('jugador2')
                    .setDescription('Segundo jugador')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('compra')
            .setDescription('Propón el fichaje de un jugador')
            .addUserOption(option =>
                option.setName('jugador')
                    .setDescription('Jugador al que quieres fichar')
                    .setRequired(true)
            )
            .addIntegerOption(option =>
                option.setName('precio')
                    .setDescription('Precio de la oferta en monedas')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(1000000000)
            ),

        new SlashCommandBuilder()
            .setName('remover')
            .setDescription('Retira un jugador de la liga (Head Staff)')
            .addUserOption(option =>
                option.setName('jugador')
                    .setDescription('Jugador que se retirará de la liga')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('motivo')
                    .setDescription('Motivo de la retirada')
                    .setRequired(true)
                    .setMaxLength(500)
            ),

        new SlashCommandBuilder()
            .setName('ayuda')
            .setDescription('Lista de comandos')
    ];
}

async function registerCommands() {
    const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

    if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
        throw new Error('Configura DISCORD_TOKEN, CLIENT_ID y GUILD_ID.');
    }

    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: buildCommands().map(command => command.toJSON()) }
    );

    console.log('Comandos registrados en el servidor.');
}

function calculateAttack(player) {
    const stats = player.stats;

    if (player.position === 'delantero') {
        return stats.tiro * 0.30 +
            stats.definicion * 0.30 +
            stats.velocidad * 0.20 +
            stats.aceleracion * 0.20;
    }

    if (player.position === 'mediocampista') {
        return stats.pase * 0.30 +
            stats.vision * 0.30 +
            stats.control * 0.20 +
            stats.tiro * 0.20;
    }

    return stats.tiro * 0.30 +
        stats.definicion * 0.20 +
        stats.velocidad * 0.20 +
        stats.control * 0.30;
}

function calculateDefense(player) {
    const stats = player.stats;

    if (player.position === 'portero') {
        return stats.reflejos * 0.65 + stats.defensa * 0.35;
    }

    if (player.position === 'defensa') {
        return stats.defensa * 0.55 + stats.fisico * 0.30 +
            stats.velocidad * 0.15;
    }

    return stats.defensa * 0.45 + stats.fisico * 0.25 +
        stats.control * 0.15 + stats.velocidad * 0.15;
}

function simulateMatch(player1, player2) {
    let goals1 = 0;
    let goals2 = 0;
    const events = [];

    for (let minute = 1; minute <= 90; minute += 9) {
        const firstAttacks = calculateAttack(player1) +
            Math.random() * 35;
        const secondDefends = calculateDefense(player2) +
            Math.random() * 30;

        if (firstAttacks > secondDefends + 15 && Math.random() < 0.45) {
            goals1++;
            events.push(`⚽ ${minute}' — ¡Gol de ${player1.name}!`);
        } else if (firstAttacks > secondDefends && Math.random() < 0.35) {
            events.push(`🧤 ${minute}' — ${player2.name} evita el gol.`);
        } else {
            events.push(`⚔️ ${minute}' — Ataque sin gol.`);
        }

        const secondAttacks = calculateAttack(player2) +
            Math.random() * 35;
        const firstDefends = calculateDefense(player1) +
            Math.random() * 30;

        if (secondAttacks > firstDefends + 15 && Math.random() < 0.45) {
            goals2++;
            events.push(`⚽ ${minute + 3}' — ¡Gol de ${player2.name}!`);
        } else if (secondAttacks > firstDefends && Math.random() < 0.35) {
            events.push(`🧤 ${minute + 3}' — ${player1.name} evita el gol.`);
        }
    }

    return { goals1, goals2, events };
}

client.once('ready', () => {
    console.log(`⚽ Nexyron Football conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    try {
        // Botones para aceptar o rechazar fichajes.
        if (interaction.isButton()) {
            const [action, offerId] = interaction.customId.split(':');

            if (!['offer_accept', 'offer_reject'].includes(action)) return;

            const offer = data.offers[offerId];

            if (!offer || offer.status !== 'pending') {
                return interaction.reply({
                    content: 'Esta oferta ya no está disponible.',
                    ephemeral: true
                });
            }

            if (interaction.user.id !== offer.playerId) {
                return interaction.reply({
                    content: 'Solo el jugador que recibió la oferta puede responder.',
                    ephemeral: true
                });
            }

            if (action === 'offer_reject') {
                offer.status = 'rejected';
                saveData();

                await interaction.update({
                    content: `❌ <@${offer.playerId}> ha rechazado la oferta de **${offer.teamName}**.`,
                    components: []
                });

                return;
            }

            const buyerTeam = data.teams[offer.buyerTeamId];
            const player = data.players[offer.playerId];
            const sellerTeam = getTeam(offer.playerId);

            if (!buyerTeam || !player) {
                offer.status = 'cancelled';
                saveData();

                return interaction.update({
                    content: 'La oferta se canceló porque el equipo o el jugador ya no existe.',
                    components: []
                });
            }

            if (sellerTeam && sellerTeam.id === buyerTeam.id) {
                offer.status = 'cancelled';
                saveData();

                return interaction.update({
                    content: 'No puedes comprar un jugador que ya pertenece a tu equipo.',
                    components: []
                });
            }

            if (buyerTeam.managerId !== offer.buyerManagerId) {
                offer.status = 'cancelled';
                saveData();

                return interaction.update({
                    content: 'La oferta se canceló porque cambió el manager comprador.',
                    components: []
                });
            }

            if (buyerTeam.balance < offer.price) {
                offer.status = 'cancelled';
                saveData();

                return interaction.update({
                    content: 'La oferta se canceló porque el equipo ya no tiene saldo suficiente.',
                    components: []
                });
            }

            // El jugador debe seguir en la misma situación que al ofertar.
            if ((sellerTeam?.id || null) !== offer.originalTeamId) {
                offer.status = 'cancelled';
                saveData();

                return interaction.update({
                    content: 'La oferta se canceló porque cambió el equipo del jugador.',
                    components: []
                });
            }

            buyerTeam.balance -= offer.price;

            if (sellerTeam) {
                sellerTeam.balance += offer.price;
            }

            removeFromTeam(offer.playerId);

            buyerTeam.members.push(offer.playerId);
            player.teamId = buyerTeam.id;

            offer.status = 'accepted';
            saveData();

            await interaction.update({
                content:
                    `✅ **FICHAJE COMPLETADO**\n\n` +
                    `⚽ Jugador: <@${offer.playerId}>\n` +
                    `🏆 Nuevo equipo: **${buyerTeam.name}**\n` +
                    `💰 Precio: **${money(offer.price)}**\n` +
                    `💵 Saldo del comprador: **${money(buyerTeam.balance)}**`,
                components: []
            });

            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.commandName;

        if (command === 'ayuda') {
            return interaction.reply({
                ephemeral: true,
                content:
                    '**⚽ NEXYRON FOOTBALL**\n\n' +
                    '`/jugador crear` — crea tu jugador.\n' +
                    '`/perfil` — consulta estadísticas.\n' +
                    '`/entrenar` — entrena cada 12 horas.\n' +
                    '`/equipo crear` — crea un equipo.\n' +
                    '`/equipo fichar` — ficha jugadores libres.\n' +
                    '`/equipo cargo` — asigna capitán o manager.\n' +
                    '`/equipo info` — consulta tu plantilla.\n' +
                    '`/simular` — simula un partido individual.\n' +
                    '`/compra` — propone un fichaje negociado.\n' +
                    '`/remover` — retira jugadores de la liga (Head Staff).'
            });
        }

        if (command === 'remover') {
            if (!HEAD_STAFF_IDS.includes(interaction.user.id)) {
                return interaction.reply({
                    content: '⛔ Solo el Head Staff autorizado puede usar este comando.',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('jugador');
            const reason = interaction.options.getString('motivo');

            if (user.id === interaction.user.id) {
                return interaction.reply({
                    content: 'No puedes removerte a ti mismo.',
                    ephemeral: true
                });
            }

            if (!data.players[user.id]) {
                return interaction.reply({
                    content: 'Ese usuario no tiene un jugador registrado en la liga.',
                    ephemeral: true
                });
            }

            const oldTeam = getTeam(user.id);
            const oldTeamName = oldTeam?.name || 'Sin equipo';

            removeFromTeam(user.id);

            delete data.players[user.id];

            for (const offer of Object.values(data.offers)) {
                if (
                    offer.status === 'pending' &&
                    (offer.playerId === user.id ||
                     offer.buyerManagerId === user.id)
                ) {
                    offer.status = 'cancelled';
                }
            }

            saveData();

            console.log(
                `[HEAD STAFF] ${interaction.user.tag} removió a ${user.tag}. ` +
                `Equipo: ${oldTeamName}. Motivo: ${reason}`
            );

            await interaction.reply({
                content:
                    `🛡️ **JUGADOR RETIRADO DE LA LIGA**\n\n` +
                    `Jugador: <@${user.id}>\n` +
                    `Equipo anterior: **${oldTeamName}**\n` +
                    `Motivo: ${reason}\n` +
                    `Autorizado por: <@${interaction.user.id}>`
            });

            try {
                await user.send(
                    `Has sido retirado de la liga Nexyron Football.\nMotivo: ${reason}`
                );
            } catch {
                // Los mensajes privados pueden estar desactivados.
            }

            return;
        }

        if (command === 'jugador') {
            const position = interaction.options.getString('posicion');
            const existing = data.players[interaction.user.id];

            if (existing) {
                return interaction.reply({
                    content: 'Ya tienes un jugador. No puedes volver a crearlo.',
                    ephemeral: true
                });
            }

            const player = getPlayer(interaction.user);
            player.position = position;
            saveData();

            return interaction.reply(
                `⚽ **Jugador creado**\n` +
                `Posición: **${positionName(position)}**\n` +
                `Media inicial: **${overall(player.stats)}**`
            );
        }

        if (command === 'perfil') {
            const user = interaction.options.getUser('usuario') || interaction.user;
            const player = data.players[user.id];

            if (!player) {
                return interaction.reply({
                    content: 'Este usuario no tiene jugador. Usa `/jugador crear`.',
                    ephemeral: true
                });
            }

            const stats = Object.entries(player.stats)
                .map(([key, value]) => `**${STAT_NAMES[key]}:** ${value}`)
                .join('\n');

            return interaction.reply(
                `⚽ **PERFIL DE ${player.name.toUpperCase()}**\n\n` +
                `**Posición:** ${positionName(player.position)}\n` +
                `**Media:** ${overall(player.stats)}/100\n` +
                `**Equipo:** ${getPlayerTeamName(user.id)}\n` +
                `**Partidos:** ${player.matches}\n` +
                `**Victorias:** ${player.wins}\n` +
                `**Empates:** ${player.draws}\n` +
                `**Derrotas:** ${player.losses}\n` +
                `**Goles simulados:** ${player.goals}\n\n${stats}`
            );
        }

        if (command === 'entrenar') {
            const player = data.players[interaction.user.id];

            if (!player) {
                return interaction.reply({
                    content: 'Primero crea tu jugador con `/jugador crear`.',
                    ephemeral: true
                });
            }

            const remaining = TRAINING_COOLDOWN -
                (Date.now() - player.lastTraining);

            if (remaining > 0) {
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.ceil((remaining % 3600000) / 60000);

                return interaction.reply({
                    content: `🏋️ Podrás volver a entrenar en ${hours} h ${minutes} min.`,
                    ephemeral: true
                });
            }

            const type = interaction.options.getString('tipo');
            const training = TRAININGS.find(t => t.value === type);
            const improved = [];

            for (const stat of training.stats) {
                const before = player.stats[stat];
                const increase = hasPositionBonus(player.position, stat) ? 2 : 1;

                player.stats[stat] = Math.min(100, before + increase);

                if (player.stats[stat] > before) {
                    improved.push(
                        `${STAT_NAMES[stat]}: ${before} → ${player.stats[stat]}`
                    );
                }
            }

            player.lastTraining = Date.now();
            player.trainingCount++;
            saveData();

            return interaction.reply(
                `🏋️ **ENTRENAMIENTO COMPLETADO**\n\n` +
                `Jugador: <@${interaction.user.id}>\n` +
                `Ejercicio: **${training.name}**\n` +
                `Posición: **${positionName(player.position)}**\n\n` +
                `${improved.join('\n') || 'Todas las estadísticas entrenadas están al máximo.'}\n\n` +
                `Media: **${overall(player.stats)}/100**\n` +
                `Próximo entrenamiento en 12 horas.`
            );
        }

        if (command === 'equipo') {
            const sub = interaction.options.getSubcommand();

            if (sub === 'crear') {
                const name = interaction.options.getString('nombre').trim();

                if (!data.players[interaction.user.id]) {
                    return interaction.reply({
                        content: 'Primero crea tu jugador con `/jugador crear`.',
                        ephemeral: true
                    });
                }

                if (getTeam(interaction.user.id)) {
                    return interaction.reply({
                        content: 'Ya perteneces a un equipo.',
                        ephemeral: true
                    });
                }

                if (Object.values(data.teams).some(
                    team => team.name.toLowerCase() === name.toLowerCase()
                )) {
                    return interaction.reply({
                        content: 'Ese nombre de equipo ya existe.',
                        ephemeral: true
                    });
                }

                const id = interaction.user.id;

                data.teams[id] = {
                    id,
                    name,
                    managerId: id,
                    captainId: id,
                    members: [id],
                    balance: STARTING_BUDGET
                };

                data.players[id].teamId = id;
                saveData();

                return interaction.reply(
                    `🏆 **${name} creado**\n` +
                    `👑 Capitán: <@${id}>\n` +
                    `🧑‍💼 Manager: <@${id}>\n` +
                    `💰 Presupuesto inicial: **${money(STARTING_BUDGET)}**`
                );
            }

            if (sub === 'fichar') {
                const team = getTeam(interaction.user.id);

                if (!team || team.managerId !== interaction.user.id) {
                    return interaction.reply({
                        content: 'Solo el manager puede fichar jugadores libres.',
                        ephemeral: true
                    });
                }

                const user = interaction.options.getUser('jugador');

                if (user.bot || user.id === interaction.user.id) {
                    return interaction.reply({
                        content: 'Selecciona otro jugador real.',
                        ephemeral: true
                    });
                }

                if (!data.players[user.id]) {
                    return interaction.reply({
                        content: 'Ese usuario debe crear su jugador primero.',
                        ephemeral: true
                    });
                }

                if (getTeam(user.id)) {
                    return interaction.reply({
                        content: 'Ese jugador ya pertenece a un equipo. Usa `/compra` para proponer un traspaso.',
                        ephemeral: true
                    });
                }

                team.members.push(user.id);
                data.players[user.id].teamId = team.id;
                saveData();

                return interaction.reply(
                    `✅ <@${user.id}> ha sido fichado por **${team.name}**.`
                );
            }

            if (sub === 'cargo') {
                const team = getTeam(interaction.user.id);

                if (!team || team.managerId !== interaction.user.id) {
                    return interaction.reply({
                        content: 'Solo el manager actual puede cambiar cargos.',
                        ephemeral: true
                    });
                }

                const user = interaction.options.getUser('jugador');
                const role = interaction.options.getString('cargo');

                if (!team.members.includes(user.id)) {
                    return interaction.reply({
                        content: 'Ese jugador no pertenece a tu equipo.',
                        ephemeral: true
                    });
                }

                if (role === 'capitan') {
                    team.captainId = user.id;
                } else {
                    team.managerId = user.id;
                }

                saveData();

                return interaction.reply(
                    `✅ <@${user.id}> ahora es ${role === 'capitan' ? 'capitán' : 'manager'} de **${team.name}**.`
                );
            }

            if (sub === 'info') {
                const team = getTeam(interaction.user.id);

                if (!team) {
                    return interaction.reply({
                        content: 'No perteneces a ningún equipo.',
                        ephemeral: true
                    });
                }

                const members = team.members.map(id => {
                    const player = data.players[id];
                    const captain = team.captainId === id ? ' 👑' : '';
                    const manager = team.managerId === id ? ' 🧑‍💼' : '';

                    return `• <@${id}> — ${player ? positionName(player.position) : 'Sin perfil'}${captain}${manager}`;
                }).join('\n');

                return interaction.reply(
                    `🏆 **${team.name}**\n\n` +
                    `🧑‍💼 Manager: ${team.managerId ? `<@${team.managerId}>` : 'Sin manager'}\n` +
                    `👑 Capitán: ${team.captainId ? `<@${team.captainId}>` : 'Sin capitán'}\n` +
                    `💰 Presupuesto: **${money(team.balance)}**\n\n` +
                    `**Plantilla (${team.members.length})**\n${members}`
                );
            }
        }

        if (command === 'simular') {
            const user1 = interaction.options.getUser('jugador1');
            const user2 = interaction.options.getUser('jugador2');

            if (user1.id === user2.id) {
                return interaction.reply({
                    content: 'No puedes enfrentar a un jugador contra sí mismo.',
                    ephemeral: true
                });
            }

            const player1 = data.players[user1.id];
            const player2 = data.players[user2.id];

            if (!player1 || !player2) {
                return interaction.reply({
                    content: 'Ambos jugadores deben registrarse con `/jugador crear`.',
                    ephemeral: true
                });
            }

            const result = simulateMatch(player1, player2);

            player1.matches++;
            player2.matches++;

            if (result.goals1 > result.goals2) {
                player1.wins++;
                player2.losses++;
            } else if (result.goals2 > result.goals1) {
                player2.wins++;
                player1.losses++;
            } else {
                player1.draws++;
                player2.draws++;
            }

            player1.goals += result.goals1;
            player2.goals += result.goals2;

            saveData();

            const embed = new EmbedBuilder()
                .setColor(0x16803c)
                .setTitle('⚽ NEXYRON FOOTBALL — RESULTADO')
                .setDescription(
                    `**${player1.name}** (${positionName(player1.position)})\n` +
                    `## ${result.goals1} - ${result.goals2}\n` +
                    `**${player2.name}** (${positionName(player2.position)})`
                )
                .addFields(
                    {
                        name: 'Medias',
                        value: `${player1.name}: **${overall(player1.stats)}**\n${player2.name}: **${overall(player2.stats)}**`
                    },
                    {
                        name: 'Crónica',
                        value: result.events.slice(0, 15).join('\n') || 'Partido sin ocasiones destacadas.'
                    }
                )
                .setFooter({ text: 'Simulación basada en estadísticas y eventos aleatorios.' });

            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'compra') {
            const buyerTeam = getTeam(interaction.user.id);

            if (!buyerTeam || buyerTeam.managerId !== interaction.user.id) {
                return interaction.reply({
                    content: 'Solo el manager de un equipo puede proponer fichajes.',
                    ephemeral: true
                });
            }

            const user = interaction.options.getUser('jugador');
            const price = interaction.options.getInteger('precio');

            if (user.bot || user.id === interaction.user.id) {
                return interaction.reply({
                    content: 'Selecciona un jugador real distinto de ti.',
                    ephemeral: true
                });
            }

            const player = data.players[user.id];

            if (!player) {
                return interaction.reply({
                    content: 'Ese usuario todavía no tiene jugador registrado.',
                    ephemeral: true
                });
            }

            const sellerTeam = getTeam(user.id);

            if (sellerTeam?.id === buyerTeam.id) {
                return interaction.reply({
                    content: 'Ese jugador ya pertenece a tu equipo.',
                    ephemeral: true
                });
            }

            if (buyerTeam.balance < price) {
                return interaction.reply({
                    content: `No tienes suficiente presupuesto. Tu saldo es ${money(buyerTeam.balance)}.`,
                    ephemeral: true
                });
            }

            const pending = Object.values(data.offers).find(offer =>
                offer.status === 'pending' &&
                offer.playerId === user.id
            );

            if (pending) {
                return interaction.reply({
                    content: 'Ese jugador ya tiene una oferta pendiente.',
                    ephemeral: true
                });
            }

            const offerId = crypto.randomUUID();

            data.offers[offerId] = {
                id: offerId,
                playerId: user.id,
                buyerTeamId: buyerTeam.id,
                buyerManagerId: interaction.user.id,
                teamName: buyerTeam.name,
                price,
                originalTeamId: sellerTeam?.id || null,
                status: 'pending',
                createdAt: Date.now()
            };

            saveData();

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('💰 PROPUESTA DE FICHAJE')
                .setDescription(
                    `El equipo **${buyerTeam.name}** quiere fichar a <@${user.id}>.\n\n` +
                    `**Precio ofrecido:** ${money(price)}\n` +
                    `**Equipo actual:** ${sellerTeam?.name || 'Jugador libre'}\n\n` +
                    'Hablad y negociad antes de responder. La oferta solo se completa si el jugador la acepta.'
                )
                .setFooter({ text: 'Solo el jugador indicado puede aceptar o rechazar.' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`offer_accept:${offerId}`)
                    .setLabel('Aceptar fichaje')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`offer_reject:${offerId}`)
                    .setLabel('Rechazar oferta')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({
                content: `📨 Oferta enviada a <@${user.id}>. La decisión es suya.`,
                ephemeral: true
            });

            try {
                await user.send({
                    embeds: [embed],
                    components: [row]
                });
            } catch {
                // La oferta queda guardada, pero el jugador deberá recibirla
                // por otro canal si tiene los mensajes privados desactivados.
                await interaction.followUp({
                    content: 'No pude enviarle un mensaje privado. Pídele que habilite los mensajes directos o que permita recibir ofertas en un canal acordado.',
                    ephemeral: true
                });
            }

            return;
        }
    } catch (error) {
        console.error('Error procesando interacción:', error);

        const response = {
            content: 'Ocurrió un error. Revisa los registros del bot.',
            ephemeral: true
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(response).catch(() => {});
        } else {
            await interaction.reply(response).catch(() => {});
        }
    }
});

(async () => {
    try {
        await registerCommands();
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('No se pudo iniciar Nexyron Football:', error);
    }
})();
