
require('dotenv').config();

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const DATA_FILE = path.join(__dirname, 'football-data.json');

const TRAININGS = [
    { name: 'Control de balón', key: 'control', stats: ['control'] },
    { name: 'Tiros a puerta', key: 'tiros', stats: ['tiro', 'definicion'] },
    { name: 'Velocidad', key: 'velocidad', stats: ['velocidad'] },
    { name: 'Aceleración', key: 'aceleracion', stats: ['aceleracion'] },
    { name: 'Visión de juego', key: 'vision', stats: ['vision', 'pase'] },
    { name: 'Precisión de pase', key: 'pases', stats: ['pase', 'control'] },
    { name: 'Defensa', key: 'defensa', stats: ['defensa'] },
    { name: 'Entrenamiento físico', key: 'fisico', stats: ['fisico', 'velocidad'] },
    { name: 'Definición', key: 'definicion', stats: ['definicion', 'tiro'] },
    { name: 'Reflejos', key: 'reflejos', stats: ['reflejos'] }
];

const POSITIONS = [
    { name: 'Normal', value: 'normal' },
    { name: 'Delantero', value: 'delantero' },
    { name: 'Mediocampista', value: 'mediocampista' },
    { name: 'Defensa', value: 'defensa' },
    { name: 'Portero', value: 'portero' }
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

const POSITION_BONUSES = {
    normal: [],
    delantero: ['tiro', 'definicion', 'velocidad', 'aceleracion'],
    mediocampista: ['pase', 'vision', 'control'],
    defensa: ['defensa', 'fisico'],
    portero: ['reflejos', 'defensa']
};

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        }
    } catch (error) {
        console.error('Error leyendo los datos:', error);
    }

    return { players: {}, teams: {} };
}

const data = loadData();

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
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
            trainingCount: 0
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

function getPositionBonus(position, stat) {
    return (POSITION_BONUSES[position] || []).includes(stat);
}

function formatPosition(position) {
    return POSITIONS.find(p => p.value === position)?.name || 'Normal';
}

function calculateOverall(stats) {
    const values = Object.values(stats);
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function canManageTeam(interaction, team) {
    return team.managerId === interaction.user.id;
}

const commands = [
    new SlashCommandBuilder()
        .setName('jugador')
        .setDescription('Crea o configura tu jugador')
        .addSubcommand(sub =>
            sub.setName('crear')
                .setDescription('Crea tu jugador de fútbol')
                .addStringOption(option =>
                    option.setName('posicion')
                        .setDescription('Elige tu posición')
                        .setRequired(true)
                        .addChoices(...POSITIONS.map(p => ({
                            name: p.name,
                            value: p.value
                        })))
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
                .setDescription('Escoge tu entrenamiento')
                .setRequired(true)
                .addChoices(...TRAININGS.map(t => ({
                    name: t.name,
                    value: t.key
                })))
        ),

    new SlashCommandBuilder()
        .setName('equipo')
        .setDescription('Gestiona tu equipo de fútbol')
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
                .setDescription('Añade un jugador a tu equipo')
                .addUserOption(option =>
                    option.setName('jugador')
                        .setDescription('Jugador que quieres fichar')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('cargo')
                .setDescription('Asigna capitán o manager')
                .addUserOption(option =>
                    option.setName('jugador')
                        .setDescription('Jugador del equipo')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('cargo')
                        .setDescription('Cargo que quieres asignar')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Capitán', value: 'capitan' },
                            { name: 'Manager', value: 'manager' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Consulta tu equipo')
        ),

    new SlashCommandBuilder()
        .setName('ayuda')
        .setDescription('Muestra los comandos del bot')
];

async function registerCommands() {
    if (!process.env.DISCORD_TOKEN ||
        !process.env.CLIENT_ID ||
        !process.env.GUILD_ID) {
        throw new Error(
            'Faltan DISCORD_TOKEN, CLIENT_ID o GUILD_ID en las variables de entorno.'
        );
    }

    const rest = new REST({ version: '10' })
        .setToken(process.env.DISCORD_TOKEN);

    await rest.put(
        Routes.applicationGuildCommands(
            process.env.CLIENT_ID,
            process.env.GUILD_ID
        ),
        { body: commands.map(command => command.toJSON()) }
    );

    console.log('Comandos de Discord registrados.');
}

client.once('ready', () => {
    console.log(`⚽ Nexyron Football conectado como ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const command = interaction.commandName;

        if (command === 'ayuda') {
            return interaction.reply({
                ephemeral: true,
                content:
                    '**⚽ NEXYRON FOOTBALL**\n\n' +
                    '`/jugador crear` — crea tu jugador.\n' +
                    '`/perfil` — consulta estadísticas.\n' +
                    '`/entrenar` — entrena a tu jugador.\n' +
                    '`/equipo crear` — crea tu equipo.\n' +
                    '`/equipo fichar` — ficha jugadores.\n' +
                    '`/equipo cargo` — asigna capitán o manager.\n' +
                    '`/equipo info` — consulta tu equipo.'
            });
        }

        if (command === 'jugador') {
            const position = interaction.options.getString('posicion');
            const player = getPlayer(interaction.user);

            if (player.teamId && data.teams[player.teamId]) {
                return interaction.reply({
                    content: 'Ya perteneces a un equipo. No puedes recrear tu jugador.',
                    ephemeral: true
                });
            }

            player.position = position;
            saveData();

            return interaction.reply(
                `⚽ ¡Jugador creado!\n` +
                `**Jugador:** ${interaction.user.username}\n` +
                `**Posición:** ${formatPosition(position)}\n` +
                `**Media inicial:** ${calculateOverall(player.stats)}`
            );
        }

        if (command === 'perfil') {
            const user = interaction.options.getUser('usuario') || interaction.user;
            const player = data.players[user.id];

            if (!player) {
                return interaction.reply({
                    content: 'Este usuario todavía no ha creado su jugador con `/jugador crear`.',
                    ephemeral: true
                });
            }

            const stats = Object.entries(player.stats)
                .map(([key, value]) => `**${STAT_NAMES[key]}:** ${value}`)
                .join('\n');

            const team = getTeamByMember(user.id);

            return interaction.reply(
                `⚽ **PERFIL DE ${player.name.toUpperCase()}**\n\n` +
                `**Posición:** ${formatPosition(player.position)}\n` +
                `**Media:** ${calculateOverall(player.stats)}\n` +
                `**Equipo:** ${team ? team.name : 'Sin equipo'}\n\n` +
                `${stats}`
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

            const now = Date.now();
            const cooldown = 12 * 60 * 60 * 1000;
            const remaining = cooldown - (now - player.lastTraining);

            if (remaining > 0) {
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.ceil((remaining % 3600000) / 60000);

                return interaction.reply({
                    content: `🏋️ Ya entrenaste. Vuelve en **${hours} h ${minutes} min**.`,
                    ephemeral: true
                });
            }

            const type = interaction.options.getString('tipo');
            const training = TRAININGS.find(t => t.key === type);

            if (!training) {
                return interaction.reply({
                    content: 'Entrenamiento no válido.',
                    ephemeral: true
                });
            }

            const improved = [];

            for (const stat of training.stats) {
                let increase = 1;

                if (getPositionBonus(player.position, stat)) {
                    increase = 2;
                }

                const oldValue = player.stats[stat];
                player.stats[stat] = Math.min(100, oldValue + increase);

                if (player.stats[stat] > oldValue) {
                    improved.push(
                        `**${STAT_NAMES[stat]}:** ${oldValue} → ${player.stats[stat]}`
                    );
                }
            }

            player.lastTraining = now;
            player.trainingCount++;
            saveData();

            return interaction.reply(
                `🏋️ **ENTRENAMIENTO COMPLETADO**\n\n` +
                `**Jugador:** ${interaction.user.username}\n` +
                `**Entrenamiento:** ${training.name}\n` +
                `**Posición:** ${formatPosition(player.position)}\n\n` +
                `${improved.join('\n') || 'Tus estadísticas ya están al máximo.'}\n\n` +
                `**Media actual:** ${calculateOverall(player.stats)}/100\n` +
                `Podrás volver a entrenar en 12 horas.`
            );
        }

        if (command === 'equipo') {
            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'crear') {
                const name = interaction.options.getString('nombre').trim();

                if (!data.players[interaction.user.id]) {
                    return interaction.reply({
                        content: 'Primero crea tu jugador con `/jugador crear`.',
                        ephemeral: true
                    });
                }

                if (getTeamByMember(interaction.user.id)) {
                    return interaction.reply({
                        content: 'Ya perteneces a un equipo.',
                        ephemeral: true
                    });
                }

                const exists = Object.values(data.teams).some(
                    team => team.name.toLowerCase() === name.toLowerCase()
                );

                if (exists) {
                    return interaction.reply({
                        content: 'Ya existe un equipo con ese nombre.',
                        ephemeral: true
                    });
                }

                const id = interaction.user.id;

                data.teams[id] = {
                    id,
                    name,
                    managerId: id,
                    captainId: id,
                    members: [id]
                };

                data.players[id].teamId = id;
                saveData();

                return interaction.reply(
                    `🏆 **EQUIPO CREADO: ${name}**\n\n` +
                    `👑 **Manager:** <@${id}>\n` +
                    `⚽ **Capitán:** <@${id}>\n` +
                    `👥 **Jugadores:** 1`
                );
            }

            if (subcommand === 'fichar') {
                const team = getTeamByMember(interaction.user.id);

                if (!team || !canManageTeam(interaction, team)) {
                    return interaction.reply({
                        content: 'Solo el manager de un equipo puede fichar jugadores.',
                        ephemeral: true
                    });
                }

                const user = interaction.options.getUser('jugador');

                if (user.bot) {
                    return interaction.reply({
                        content: 'No puedes fichar bots.',
                        ephemeral: true
                    });
                }

                if (!data.players[user.id]) {
                    return interaction.reply({
                        content: 'Ese usuario debe crear primero su jugador con `/jugador crear`.',
                        ephemeral: true
                    });
                }

                if (getTeamByMember(user.id)) {
                    return interaction.reply({
                        content: 'Ese jugador ya pertenece a un equipo.',
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

            if (subcommand === 'cargo') {
                const team = getTeamByMember(interaction.user.id);

                if (!team || !canManageTeam(interaction, team)) {
                    return interaction.reply({
                        content: 'Solo el manager puede asignar cargos.',
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
                    saveData();

                    return interaction.reply(
                        `👑 <@${user.id}> ahora es el capitán de **${team.name}**.`
                    );
                }

                if (role === 'manager') {
                    team.managerId = user.id;
                    saveData();

                    return interaction.reply(
                        `🧑‍💼 <@${user.id}> ahora es el manager de **${team.name}**.`
                    );
                }
            }

            if (subcommand === 'info') {
                const team = getTeamByMember(interaction.user.id);

                if (!team) {
                    return interaction.reply({
                        content: 'No perteneces a ningún equipo.',
                        ephemeral: true
                    });
                }

                const members = team.members
                    .map(id => {
                        const player = data.players[id];
                        return `• ${id === team.captainId ? '👑 ' : ''}<@${id}> — ${
                            player ? formatPosition(player.position) : 'Sin posición'
                        }`;
                    })
                    .join('\n');

                return interaction.reply(
                    `🏆 **${team.name}**\n\n` +
                    `🧑‍💼 **Manager:** <@${team.managerId}>\n` +
                    `👑 **Capitán:** <@${team.captainId}>\n` +
                    `👥 **Plantilla (${team.members.length}):**\n${members}`
                );
            }
        }
    } catch (error) {
        console.error('Error en comando:', error);

        const message = {
            content: 'Ocurrió un error al ejecutar el comando.',
            ephemeral: true
        };

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(message).catch(() => {});
        } else {
            await interaction.reply(message).catch(() => {});
        }
    }
});

(async () => {
    try {
        await registerCommands();
        await client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
        console.error('No se pudo iniciar el bot:', error);
    }
})();
