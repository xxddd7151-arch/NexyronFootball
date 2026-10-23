
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.DirectMessages
  ]
});

const DATA_FILE = path.join(__dirname, "football-data.json");
const TRAINING_COOLDOWN = 12 * 60 * 60 * 1000;
const INITIAL_BUDGET = 1_000_000;
const MAX_STAT = 100;

const POSITIONS = [
  { name: "Normal", value: "normal" },
  { name: "Delantero", value: "delantero" },
  { name: "Mediocampista", value: "mediocampista" },
  { name: "Defensa", value: "defensa" },
  { name: "Portero", value: "portero" }
];

const TRAINING = [
  { name: "Control de balón", value: "control" },
  { name: "Tiros a puerta", value: "tiros" },
  { name: "Velocidad", value: "velocidad" },
  { name: "Aceleración", value: "aceleracion" },
  { name: "Visión de juego", value: "vision" },
  { name: "Precisión de pase", value: "pase" },
  { name: "Defensa", value: "defensa" },
  { name: "Entrenamiento físico", value: "fisico" },
  { name: "Definición", value: "definicion" },
  { name: "Reflejos", value: "reflejos" }
];

const STAT_NAMES = {
  control: "Control de balón",
  tiros: "Tiros a puerta",
  velocidad: "Velocidad",
  aceleracion: "Aceleración",
  vision: "Visión de juego",
  pase: "Precisión de pase",
  defensa: "Defensa",
  fisico: "Entrenamiento físico",
  definicion: "Definición",
  reflejos: "Reflejos"
};

function createDefaultData() {
  return {
    players: {},
    teams: {},
    offers: {},
    history: []
  };
}

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return createDefaultData();
    }

    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    return {
      ...createDefaultData(),
      ...parsed
    };
  } catch (error) {
    console.error("Error leyendo football-data.json:", error);
    return createDefaultData();
  }
}

let data = loadData();

function saveData() {
  const tempFile = `${DATA_FILE}.tmp`;

  fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempFile, DATA_FILE);
}

function newId() {
  return crypto.randomUUID();
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min = 0, max = MAX_STAT) {
  return Math.max(min, Math.min(max, value));
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString("es-ES")} monedas`;
}

function getPlayer(userId) {
  return data.players[userId] || null;
}

function getTeam(teamId) {
  return data.teams[teamId] || null;
}

function getPlayerTeam(playerId) {
  return Object.values(data.teams).find(team =>
    team.members.includes(playerId)
  ) || null;
}

function findTeamByName(name) {
  const normalized = name.trim().toLowerCase();

  return Object.values(data.teams).find(team =>
    team.name.toLowerCase() === normalized
  ) || null;
}

function createStats() {
  return {
    control: 50,
    tiros: 50,
    velocidad: 50,
    aceleracion: 50,
    vision: 50,
    pase: 50,
    defensa: 50,
    fisico: 50,
    definicion: 50,
    reflejos: 50
  };
}

function calculateOverall(player) {
  const s = player.stats;

  let overall;

  switch (player.position) {
    case "delantero":
      overall =
        s.tiros * 0.20 +
        s.definicion * 0.25 +
        s.velocidad * 0.15 +
        s.control * 0.15 +
        s.aceleracion * 0.10 +
        s.fisico * 0.05 +
        s.vision * 0.05 +
        s.pase * 0.05;
      break;

    case "mediocampista":
      overall =
        s.pase * 0.20 +
        s.vision * 0.20 +
        s.control * 0.20 +
        s.fisico * 0.10 +
        s.velocidad * 0.10 +
        s.defensa * 0.10 +
        s.tiros * 0.05 +
        s.definicion * 0.05;
      break;

    case "defensa":
      overall =
        s.defensa * 0.30 +
        s.fisico * 0.20 +
        s.velocidad * 0.15 +
        s.aceleracion * 0.10 +
        s.pase * 0.10 +
        s.control * 0.05 +
        s.vision * 0.05 +
        s.reflejos * 0.05;
      break;

    case "portero":
      overall =
        s.reflejos * 0.40 +
        s.defensa * 0.20 +
        s.fisico * 0.15 +
        s.vision * 0.10 +
        s.aceleracion * 0.05 +
        s.pase * 0.05 +
        s.control * 0.05;
      break;

    default:
      overall = Object.values(s).reduce((a, b) => a + b, 0) /
        Object.values(s).length;
  }

  return Math.round(overall);
}

function getPositionLabel(position) {
  return POSITIONS.find(p => p.value === position)?.name || "Normal";
}

function createPlayer(user, position) {
  const player = {
    userId: user.id,
    username: user.username,
    position,
    stats: createStats(),
    createdAt: Date.now(),
    lastTraining: 0,
    matches: 0,
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    mvp: 0
  };

  data.players[user.id] = player;
  return player;
}

function removeFromTeam(playerId) {
  const team = getPlayerTeam(playerId);

  if (!team) return null;

  team.members = team.members.filter(id => id !== playerId);

  if (team.managerId === playerId) {
    team.managerId = null;
  }

  if (team.captainId === playerId) {
    team.captainId = null;
  }

  return team;
}

function isManager(userId, team) {
  return Boolean(team && team.managerId === userId);
}

function isHeadStaff(userId) {
  const ids = (process.env.HEAD_STAFF_IDS || "")
    .split(",")
    .map(id => id.trim())
    .filter(Boolean);

  return ids.includes(userId);
}

function statBar(value) {
  const filled = Math.round(clamp(value) / 10);
  return "🟩".repeat(filled) + "⬛".repeat(10 - filled);
}

function createEmbed(title, description, color = 0x3498db) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function getTeamStrength(team) {
  const players = team.members
    .map(id => getPlayer(id))
    .filter(Boolean);

  if (players.length === 0) {
    return {
      attack: 35,
      midfield: 35,
      defense: 35,
      goalkeeper: 35,
      overall: 35,
      players
    };
  }

  const average = (list, fn) => {
    if (!list.length) return 35;
    return list.reduce((sum, p) => sum + fn(p), 0) / list.length;
  };

  const forwards = players.filter(p => p.position === "delantero");
  const midfielders = players.filter(p => p.position === "mediocampista");
  const defenders = players.filter(p => p.position === "defensa");
  const goalkeepers = players.filter(p => p.position === "portero");

  const attack = average(
    forwards.length ? forwards : players,
    p => p.stats.tiros * 0.35 +
      p.stats.definicion * 0.35 +
      p.stats.velocidad * 0.15 +
      p.stats.control * 0.15
  );

  const midfield = average(
    midfielders.length ? midfielders : players,
    p => p.stats.pase * 0.35 +
      p.stats.vision * 0.30 +
      p.stats.control * 0.20 +
      p.stats.fisico * 0.15
  );

  const defense = average(
    defenders.length ? defenders : players,
    p => p.stats.defensa * 0.45 +
      p.stats.fisico * 0.25 +
      p.stats.velocidad * 0.15 +
      p.stats.aceleracion * 0.15
  );

  const goalkeeper = average(
    goalkeepers.length ? goalkeepers : players,
    p => p.position === "portero"
      ? p.stats.reflejos * 0.65 + p.stats.defensa * 0.20 + p.stats.fisico * 0.15
      : p.stats.reflejos * 0.35 + p.stats.defensa * 0.35 +
        p.stats.fisico * 0.15 + p.stats.aceleracion * 0.15
  );

  return {
    attack,
    midfield,
    defense,
    goalkeeper,
    overall: (attack + midfield + defense + goalkeeper) / 4,
    players
  };
}

function weightedPick(players, weightFunction) {
  if (!players.length) return null;

  const weights = players.map(player =>
    Math.max(1, weightFunction(player))
  );

  let total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;

  for (let i = 0; i < players.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return players[i];
  }

  return players[players.length - 1];
}

function getAttackers(team) {
  return team.members
    .map(id => getPlayer(id))
    .filter(Boolean)
    .filter(p => p.position === "delantero" ||
      p.position === "mediocampista");
}

function getDefenders(team) {
  return team.members
    .map(id => getPlayer(id))
    .filter(Boolean)
    .filter(p => p.position === "defensa" ||
      p.position === "portero");
}

function getScorer(team) {
  const candidates = getAttackers(team);
  const players = candidates.length ? candidates : team.members
    .map(id => getPlayer(id))
    .filter(Boolean);

  return weightedPick(players, p =>
    p.stats.definicion + p.stats.tiros + p.stats.control
  );
}

function getAssistant(team, scorer) {
  const candidates = team.members
    .map(id => getPlayer(id))
    .filter(Boolean)
    .filter(p => p.userId !== scorer?.userId);

  return weightedPick(candidates, p =>
    p.stats.pase + p.stats.vision + p.stats.control
  );
}

function getGoalkeeper(team) {
  const players = team.members
    .map(id => getPlayer(id))
    .filter(Boolean);

  return weightedPick(
    players.filter(p => p.position === "portero"),
    p => p.stats.reflejos + p.stats.defensa
  ) || weightedPick(players, p => p.stats.reflejos + p.stats.defensa);
}

function getPlayerRating(player, performance) {
  const base = calculateOverall(player) / 10;
  return Math.max(3.0, Math.min(10.0, base + performance));
}

function recordHistory(match) {
  data.history.unshift(match);
  data.history = data.history.slice(0, 100);
}

function buildMatchReport(home, away, match) {
  const embed = createEmbed(
    `⚽ ${home.name} ${match.homeGoals} - ${match.awayGoals} ${away.name}`,
    `**🏟️ Partido finalizado**\n` +
    `**Resultado:** ${match.result}\n` +
    `**MVP:** ${match.mvp ? `<@${match.mvp.userId}>` : "No disponible"}\n` +
    `**Valoración MVP:** ${match.mvp ? `${match.mvp.rating.toFixed(1)}/10` : "N/D"}`,
    0x1f8b4c
  );

  embed.addFields(
    {
      name: "📊 Estadísticas del partido",
      value:
        `**Posesión:** ${match.stats.homePossession}% - ${100 - match.stats.homePossession}%\n` +
        `**Tiros:** ${match.stats.homeShots} - ${match.stats.awayShots}\n` +
        `**Tiros a puerta:** ${match.stats.homeOnTarget} - ${match.stats.awayOnTarget}\n` +
        `**Córneres:** ${match.stats.homeCorners} - ${match.stats.awayCorners}\n` +
        `**Faltas:** ${match.stats.homeFouls} - ${match.stats.awayFouls}\n` +
        `**Tarjetas amarillas:** ${match.stats.homeYellow} - ${match.stats.awayYellow}\n` +
        `**Tarjetas rojas:** ${match.stats.homeRed} - ${match.stats.awayRed}`,
      inline: false
    },
    {
      name: "🥇 Mejor jugador",
      value: match.mvp
        ? `<@${match.mvp.userId}> — ${match.mvp.name}\n` +
          `Goles: ${match.mvp.goals} | Asistencias: ${match.mvp.assists}\n` +
          `Valoración: **${match.mvp.rating.toFixed(1)}/10**`
        : "No disponible",
      inline: false
    }
  );

  return embed;
}

function simulateMatch(home, away) {
  const homeStrength = getTeamStrength(home);
  const awayStrength = getTeamStrength(away);

  const homeScore = {
    goals: 0,
    shots: 0,
    onTarget: 0,
    corners: 0,
    fouls: 0,
    yellow: 0,
    red: 0
  };

  const awayScore = {
    goals: 0,
    shots: 0,
    onTarget: 0,
    corners: 0,
    fouls: 0,
    yellow: 0,
    red: 0
  };

  const playerPerformance = {};
  const events = [];
  const allPlayers = [...homeStrength.players, ...awayStrength.players];

  for (const player of allPlayers) {
    playerPerformance[player.userId] = {
      player,
      goals: 0,
      assists: 0,
      saves: 0,
      keyPasses: 0,
      tackles: 0,
      mistakes: 0,
      performance: 0,
      rating: 0
    };
  }

  function attack(team, opponent, own, opposing, minute, isHome) {
    const strength = getTeamStrength(team);
    const opponentStrength = getTeamStrength(opponent);

    const homeBonus = isHome ? 3 : 0;
    const chance = strength.attack * 0.45 +
      strength.midfield * 0.25 +
      homeBonus +
      randomInt(-15, 15);

    const defensivePower = opponentStrength.defense * 0.50 +
      opponentStrength.goalkeeper * 0.50;

    own.shots++;

    if (Math.random() < Math.max(0.10, Math.min(0.85, chance / 100))) {
      own.onTarget++;

      const scorer = getScorer(team);
      const keeper = getGoalkeeper(opponent);

      const attackValue = scorer
        ? scorer.stats.definicion * 0.50 +
          scorer.stats.tiros * 0.30 +
          scorer.stats.control * 0.20
        : strength.attack;

      const keeperValue = keeper
        ? keeper.stats.reflejos * 0.70 +
          keeper.stats.defensa * 0.30
        : opponentStrength.goalkeeper;

      const goalProbability = Math.max(
        0.08,
        Math.min(0.72, 0.38 + (attackValue - keeperValue) / 180)
      );

      if (Math.random() < goalProbability) {
        own.goals++;

        let assistant = null;
        if (Math.random() < 0.72) {
          assistant = getAssistant(team, scorer);
        }

        if (scorer) {
          playerPerformance[scorer.userId].goals++;
          playerPerformance[scorer.userId].performance += 2.0;
          scorer.goals++;
        }

        if (assistant) {
          playerPerformance[assistant.userId].assists++;
          playerPerformance[assistant.userId].performance += 1.0;
          assistant.assists++;
        }

        events.push({
          minute,
          type: "goal",
          team: team.name,
          text: `⚽ **${minute}' GOL de ${team.name}** — ${scorer ? `<@${scorer.userId}>` : "Goleador desconocido"}` +
            (assistant ? ` (asistencia de <@${assistant.userId}>)` : "") + "!"
        });
      } else {
        if (keeper) {
          playerPerformance[keeper.userId].saves++;
          playerPerformance[keeper.userId].performance += 0.35;
        }

        events.push({
          minute,
          type: "save",
          team: opponent.name,
          text: `🧤 **${minute}' PARADÓN** — el portero de ${opponent.name} evita el gol.`
        });
      }
    } else {
      const defender = weightedPick(
        getDefenders(opponent),
        p => p.stats.defensa + p.stats.fisico
      );

      if (defender) {
        playerPerformance[defender.userId].tackles++;
        playerPerformance[defender.userId].performance += 0.15;
      }

      if (Math.random() < 0.50) {
        own.corners++;
        events.push({
          minute,
          type: "corner",
          team: team.name,
          text: `🚩 **${minute}' Córner** para ${team.name}.`
        });
      }
    }
  }

  for (let minute = 1; minute <= 90; minute += randomInt(4, 7)) {
    const homePossession = homeStrength.midfield + randomInt(-10, 10);
    const homeHasBall = Math.random() * 100 < homePossession;

    if (homeHasBall) {
      attack(home, away, homeScore, awayScore, minute, true);
    } else {
      attack(away, home, awayScore, homeScore, minute, false);
    }

    if (Math.random() < 0.14) {
      const team = Math.random() < 0.5 ? home : away;
      const own = team === home ? homeScore : awayScore;
      own.fouls++;

      const players = team.members.map(id => getPlayer(id)).filter(Boolean);
      const player = weightedPick(players, p => p.stats.fisico + p.stats.defensa);

      if (Math.random() < 0.22) {
        own.yellow++;

        if (player) {
          playerPerformance[player.userId].performance -= 0.15;
          player.yellowCards++;
        }

        events.push({
          minute,
          type: "yellow",
          team: team.name,
          text: `🟨 **${minute}' Tarjeta amarilla** para ${player ? `<@${player.userId}>` : "un jugador"} de ${team.name}.`
        });
      } else {
        events.push({
          minute,
          type: "foul",
          team: team.name,
          text: `🦵 **${minute}' Falta** de ${player ? `<@${player.userId}>` : "un jugador"} de ${team.name}.`
        });
      }
    }

    if (Math.random() < 0.025) {
      const team = Math.random() < 0.5 ? home : away;
      const own = team === home ? homeScore : awayScore;

      if (own.yellow > 0 && Math.random() < 0.20) {
        own.red++;

        const player = weightedPick(
          team.members.map(id => getPlayer(id)).filter(Boolean),
          p => p.stats.defensa + p.stats.fisico
        );

        if (player) {
          player.redCards++;
          playerPerformance[player.userId].performance -= 0.8;
        }

        events.push({
          minute,
          type: "red",
          team: team.name,
          text: `🟥 **${minute}' Tarjeta roja** para ${player ? `<@${player.userId}>` : "un jugador"} de ${team.name}.`
        });
      }
    }
  }

  const homePossession = Math.max(
    25,
    Math.min(75, Math.round(50 + (homeStrength.midfield - awayStrength.midfield) / 3 + randomInt(-5, 5)))
  );

  const stats = {
    homePossession,
    homeShots: homeScore.shots,
    awayShots: awayScore.shots,
    homeOnTarget: homeScore.onTarget,
    awayOnTarget: awayScore.onTarget,
    homeCorners: homeScore.corners,
    awayCorners: awayScore.corners,
    homeFouls: homeScore.fouls,
    awayFouls: awayScore.fouls,
    homeYellow: homeScore.yellow,
    awayYellow: awayScore.yellow,
    homeRed: homeScore.red,
    awayRed: awayScore.red
  };

  const playerRatings = allPlayers.map(player => {
    const performance = playerPerformance[player.userId];
    const rating = getPlayerRating(player, performance.performance);

    performance.rating = rating;
    performance.player.matches++;

    return {
      userId: player.userId,
      name: player.username,
      team: getPlayerTeam(player.userId)?.name || "Sin equipo",
      position: player.position,
      goals: performance.goals,
      assists: performance.assists,
      saves: performance.saves,
      tackles: performance.tackles,
      rating,
      performance
    };
  });

  playerRatings.sort((a, b) => b.rating - a.rating);
  const best = playerRatings[0] || null;

  if (best) {
    const player = getPlayer(best.userId);
    if (player) player.mvp++;
  }

  let result = "Empate";
  if (homeScore.goals > awayScore.goals) result = `Victoria de ${home.name}`;
  if (awayScore.goals > homeScore.goals) result = `Victoria de ${away.name}`;

  const match = {
    id: newId(),
    date: Date.now(),
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeGoals: homeScore.goals,
    awayGoals: awayScore.goals,
    result,
    stats,
    events: events.sort((a, b) => a.minute - b.minute),
    playerRatings,
    mvp: best ? {
      userId: best.userId,
      name: best.name,
      goals: best.goals,
      assists: best.assists,
      rating: best.rating
    } : null
  };

  recordHistory(match);
  saveData();

  return match;
}
const commands = [
  new SlashCommandBuilder()
    .setName("jugador")
    .setDescription("Crear tu jugador")
    .addSubcommand(sub =>
      sub.setName("crear")
        .setDescription("Crear tu perfil de futbolista")
        .addStringOption(opt =>
          opt.setName("posicion")
            .setDescription("Tu posición")
            .setRequired(true)
            .addChoices(...POSITIONS)
        )
    ),

  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Consultar el perfil de un jugador")
    .addUserOption(opt =>
      opt.setName("jugador")
        .setDescription("Jugador que quieres consultar")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("entrenar")
    .setDescription("Entrenar a tu jugador")
    .addStringOption(opt =>
      opt.setName("entrenamiento")
        .setDescription("Entrenamiento que quieres realizar")
        .setRequired(true)
        .addChoices(...TRAINING)
    ),

  new SlashCommandBuilder()
    .setName("equipo")
    .setDescription("Administración de equipos")
    .addSubcommand(sub =>
      sub.setName("crear")
        .setDescription("Crear un equipo")
        .addStringOption(opt =>
          opt.setName("nombre")
            .setDescription("Nombre del equipo")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("fichar")
        .setDescription("Fichar un agente libre")
        .addUserOption(opt =>
          opt.setName("jugador")
            .setDescription("Jugador que deseas fichar")
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("cargo")
        .setDescription("Asignar capitán o manager")
        .addUserOption(opt =>
          opt.setName("jugador")
            .setDescription("Jugador que recibirá el cargo")
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt.setName("cargo")
            .setDescription("Cargo que quieres asignar")
            .setRequired(true)
            .addChoices(
              { name: "Capitán", value: "capitan" },
              { name: "Manager", value: "manager" }
            )
        )
    )
    .addSubcommand(sub =>
      sub.setName("info")
        .setDescription("Consultar un equipo")
        .addStringOption(opt =>
          opt.setName("nombre")
            .setDescription("Nombre del equipo; vacío para tu equipo")
            .setRequired(false)
        )
    ),

  new SlashCommandBuilder()
    .setName("simular")
    .setDescription("Simular un partido entre dos equipos")
    .addStringOption(opt =>
      opt.setName("equipo1")
        .setDescription("Primer equipo")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption(opt =>
      opt.setName("equipo2")
        .setDescription("Segundo equipo")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("compra")
    .setDescription("Proponer el fichaje de un jugador")
    .addUserOption(opt =>
      opt.setName("jugador")
        .setDescription("Jugador que quieres fichar")
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName("precio")
        .setDescription("Precio de la oferta")
        .setMinValue(1)
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("remover")
    .setDescription("Eliminar un jugador de la liga (Head Staff)")
    .addUserOption(opt =>
      opt.setName("jugador")
        .setDescription("Jugador que quieres remover")
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("motivo")
        .setDescription("Motivo de la eliminación")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ayuda")
    .setDescription("Mostrar los comandos de Nexyron Football")
].map(command => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("Comandos registrados correctamente.");
}

function playerEmbed(player, team) {
  const overall = calculateOverall(player);

  const embed = createEmbed(
    `⚽ Perfil de ${player.username}`,
    `**Posición:** ${getPositionLabel(player.position)}\n` +
    `**Media:** ${overall}/100\n` +
    `**Equipo:** ${team ? team.name : "Agente libre"}\n` +
    `**Partidos:** ${player.matches}\n` +
    `**Goles:** ${player.goals} | **Asistencias:** ${player.assists}\n` +
    `**MVP:** ${player.mvp}`,
    0x2980b9
  );

  const statLines = Object.entries(player.stats).map(([key, value]) =>
    `**${STAT_NAMES[key] || key}:** ${value}/100\n${statBar(value)}`
  );

  embed.addFields({
    name: "📊 Atributos",
    value: statLines.join("\n"),
    inline: false
  });

  return embed;
}

function teamEmbed(team) {
  const members = team.members
    .map(id => getPlayer(id))
    .filter(Boolean);

  const roster = members.length
    ? members.map(p =>
      `• ${p.position === "portero" ? "🧤" : "⚽"} <@${p.userId}> — ` +
      `${getPositionLabel(p.position)} — **${calculateOverall(p)}/100**`
    ).join("\n")
    : "Todavía no hay jugadores.";

  const strength = getTeamStrength(team);

  const embed = createEmbed(
    `🏆 ${team.name}`,
    `**Manager:** ${team.managerId ? `<@${team.managerId}>` : "Sin manager"}\n` +
    `**Capitán:** ${team.captainId ? `<@${team.captainId}>` : "Sin capitán"}\n` +
    `**Presupuesto:** ${formatMoney(team.budget)}\n` +
    `**Jugadores:** ${members.length}\n` +
    `**Media general:** ${Math.round(strength.overall)}/100`,
    0x8e44ad
  );

  embed.addFields({
    name: "👥 Plantilla",
    value: roster.length > 1024 ? roster.slice(0, 1000) + "\n..." : roster,
    inline: false
  });

  return embed;
}

async function sendMatchReport(interaction, home, away, match) {
  const embed = buildMatchReport(home, away, match);

  const eventPages = [];
  const events = match.events;

  for (let i = 0; i < events.length; i += 10) {
    eventPages.push(events.slice(i, i + 10));
  }

  const firstEvents = eventPages[0] || [];

  embed.addFields({
    name: "🎙️ Narración del partido",
    value: firstEvents.length
      ? firstEvents.map(event => event.text).join("\n").slice(0, 1024)
      : "Partido tranquilo, sin grandes ocasiones.",
    inline: false
  });

  const scorers = match.playerRatings
    .filter(p => p.goals > 0)
    .sort((a, b) => b.goals - a.goals)
    .map(p => `<@${p.userId}>: **${p.goals}** gol(es)`);

  embed.addFields({
    name: "⚽ Goleadores",
    value: scorers.length ? scorers.join("\n").slice(0, 1024) : "No hubo goles.",
    inline: false
  });

  await interaction.editReply({ embeds: [embed] });

  const details = new EmbedBuilder()
    .setColor(0x34495e)
    .setTitle("📋 Estadísticas individuales")
    .setDescription(
      match.playerRatings
        .slice(0, 20)
        .map((p, i) =>
          `**${i + 1}.** <@${p.userId}> — ${p.team}\n` +
          `⭐ ${p.rating.toFixed(1)}/10 | ⚽ ${p.goals} goles | ` +
          `🎯 ${p.assists} asistencias | 🧤 ${p.saves} paradas`
        )
        .join("\n\n") || "No hay estadísticas individuales."
    );

  await interaction.followUp({ embeds: [details] });

  // La narración completa se divide en mensajes para evitar
  // el límite de caracteres de Discord.
  const remainingEvents = events.slice(firstEvents.length);

  for (let i = 0; i < remainingEvents.length; i += 10) {
    const chunk = remainingEvents.slice(i, i + 10);

    await interaction.followUp({
      embeds: [
        new EmbedBuilder()
          .setColor(0x2c3e50)
          .setTitle("🎙️ Continuación de la narración")
          .setDescription(chunk.map(e => e.text).join("\n").slice(0, 4000))
      ]
    });
  }
}

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== "simular") return;

      const focused = interaction.options.getFocused(true);
      const teams = Object.values(data.teams);

      const matches = teams
        .filter(team => team.name.toLowerCase().includes(
          focused.value.toLowerCase()
        ))
        .slice(0, 25)
        .map(team => ({
          name: team.name.slice(0, 100),
          value: team.name.slice(0, 100)
        }));

      return interaction.respond(matches);
    }

    if (interaction.isButton()) {
      const [action, offerId] = interaction.customId.split(":");

      if (!["accept", "reject"].includes(action)) return;

      const offer = data.offers[offerId];

      if (!offer || offer.status !== "pending") {
        return interaction.reply({
          content: "Esta oferta ya no está disponible.",
          ephemeral: true
        });
      }

      if (interaction.user.id !== offer.playerId) {
        return interaction.reply({
          content: "Solo el jugador destinatario puede responder a esta oferta.",
          ephemeral: true
        });
      }

      if (action === "reject") {
        offer.status = "rejected";
        saveData();

        await interaction.update({
          content: "❌ Has rechazado la oferta de fichaje.",
          embeds: [],
          components: []
        });

        return;
      }

      const player = getPlayer(offer.playerId);
      const buyerTeam = getTeam(offer.buyerTeamId);
      const sellerTeam = getTeam(offer.sellerTeamId);

      if (!player || !buyerTeam || getPlayerTeam(player.userId)?.id !== offer.sellerTeamId) {
        offer.status = "cancelled";
        saveData();

        return interaction.update({
          content: "La oferta ya no se puede completar: el jugador o los equipos han cambiado.",
          embeds: [],
          components: []
        });
      }

      if (buyerTeam.budget < offer.price) {
        offer.status = "cancelled";
        saveData();

        return interaction.update({
          content: "La oferta se canceló porque el equipo comprador ya no tiene presupuesto suficiente.",
          embeds: [],
          components: []
        });
      }

      buyerTeam.budget -= offer.price;

      if (sellerTeam) {
        sellerTeam.budget += offer.price;
      }

      removeFromTeam(player.userId);
      buyerTeam.members.push(player.userId);

      offer.status = "accepted";
      offer.completedAt = Date.now();

      saveData();

      await interaction.update({
        content:
          `✅ **Fichaje completado**\n` +
          `<@${player.userId}> se une a **${buyerTeam.name}** por ${formatMoney(offer.price)}.`,
        embeds: [],
        components: []
      });

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "jugador") {
      const position = interaction.options.getString("posicion");
      const existing = getPlayer(interaction.user.id);

      if (existing) {
        return interaction.reply({
          content: "Ya tienes un jugador creado. Usa `/perfil` para consultarlo.",
          ephemeral: true
        });
      }

      const player = createPlayer(interaction.user, position);
      saveData();

      return interaction.reply({
        content: "¡Tu jugador ha sido creado!",
        embeds: [playerEmbed(player, null)]
      });
    }

    if (commandName === "perfil") {
      const user = interaction.options.getUser("jugador") || interaction.user;
      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content: "Ese usuario todavía no tiene un jugador creado.",
          ephemeral: true
        });
      }

      return interaction.reply({
        embeds: [playerEmbed(player, getPlayerTeam(player.userId))]
      });
    }

    if (commandName === "entrenar") {
      const player = getPlayer(interaction.user.id);

      if (!player) {
        return interaction.reply({
          content: "Primero crea tu jugador con `/jugador crear`.",
          ephemeral: true
        });
      }

      const now = Date.now();
      const remaining = TRAINING_COOLDOWN - (now - player.lastTraining);

      if (remaining > 0) {
        const hours = Math.floor(remaining / 3600000);
        const minutes = Math.floor((remaining % 3600000) / 60000);

        return interaction.reply({
          content: `Debes esperar **${hours} h ${minutes} min** para entrenar otra vez.`,
          ephemeral: true
        });
      }

      const training = interaction.options.getString("entrenamiento");
      const stat = training;
      const increase = randomInt(2, 5);
      const oldValue = player.stats[stat];

      player.stats[stat] = clamp(oldValue + increase);
      const gained = player.stats[stat] - oldValue;

      player.lastTraining = now;
      saveData();

      return interaction.reply({
        embeds: [
          createEmbed(
            "🏋️ Entrenamiento completado",
            `**Jugador:** ${player.username}\n` +
            `**Ejercicio:** ${STAT_NAMES[training]}\n` +
            `**Mejora:** +${gained} puntos\n` +
            `**Atributo:** ${player.stats[stat]}/100\n` +
            `**Nueva media:** ${calculateOverall(player)}/100\n\n` +
            "Puedes volver a entrenar en 12 horas.",
            0x27ae60
          )
        ]
      });
    }

    if (commandName === "equipo") {
      const sub = interaction.options.getSubcommand();

      if (sub === "crear") {
        const name = interaction.options.getString("nombre").trim();
        const player = getPlayer(interaction.user.id);

        if (!player) {
          return interaction.reply({
            content: "Primero crea tu jugador con `/jugador crear`.",
            ephemeral: true
          });
        }

        if (name.length < 3 || name.length > 40) {
          return interaction.reply({
            content: "El nombre debe tener entre 3 y 40 caracteres.",
            ephemeral: true
          });
        }

        if (findTeamByName(name)) {
          return interaction.reply({
            content: "Ya existe un equipo con ese nombre.",
            ephemeral: true
          });
        }

        if (getPlayerTeam(interaction.user.id)) {
          return interaction.reply({
            content: "Ya perteneces a un equipo.",
            ephemeral: true
          });
        }

        const teamId = newId();

        data.teams[teamId] = {
          id: teamId,
          name,
          managerId: interaction.user.id,
          captainId: interaction.user.id,
          members: [interaction.user.id],
          budget: INITIAL_BUDGET,
          createdAt: Date.now()
        };

        saveData();

        return interaction.reply({
          content: `🏆 ¡Se ha creado **${name}**! Presupuesto inicial: ${formatMoney(INITIAL_BUDGET)}.`,
          embeds: [teamEmbed(data.teams[teamId])]
        });
      }

      if (sub === "info") {
        const name = interaction.options.getString("nombre");
        let team = name ? findTeamByName(name) : getPlayerTeam(interaction.user.id);

        if (!team) {
          return interaction.reply({
            content: "No se encontró el equipo. Indica un nombre válido o crea/únete a uno.",
            ephemeral: true
          });
        }

        return interaction.reply({ embeds: [teamEmbed(team)] });
      }

      if (sub === "fichar") {
        const user = interaction.options.getUser("jugador");
        const team = getPlayerTeam(interaction.user.id);
        const targetPlayer = getPlayer(user.id);

        if (!team || !isManager(interaction.user.id, team)) {
          return interaction.reply({
            content: "Solo el manager de un equipo puede fichar agentes libres.",
            ephemeral: true
          });
        }

        if (!targetPlayer) {
          return interaction.reply({
            content: "Ese usuario no tiene un jugador creado.",
            ephemeral: true
          });
        }

        if (getPlayerTeam(user.id)) {
          return interaction.reply({
            content: "Ese jugador ya pertenece a un equipo. Usa `/compra` para ofrecer un traspaso.",
            ephemeral: true
          });
        }

        if (user.id === interaction.user.id) {
          return interaction.reply({
            content: "Ya perteneces a tu equipo.",
            ephemeral: true
          });
        }

        team.members.push(user.id);
        saveData();

        return interaction.reply({
          content: `✅ <@${user.id}> ha sido fichado como agente libre por **${team.name}**.`
        });
      }

      if (sub === "cargo") {
        const target = interaction.options.getUser("jugador");
        const role = interaction.options.getString("cargo");
        const team = getPlayerTeam(interaction.user.id);

        if (!team || !isManager(interaction.user.id, team)) {
          return interaction.reply({
            content: "Solo el manager puede asignar cargos.",
            ephemeral: true
          });
        }

        if (!team.members.includes(target.id)) {
          return interaction.reply({
            content: "Ese jugador debe pertenecer a tu equipo.",
            ephemeral: true
          });
        }

        if (role === "capitan") {
          team.captainId = target.id;
        } else {
          // El cargo de manager se transfiere.
          team.managerId = target.id;
        }

        saveData();

        return interaction.reply({
          content: `✅ <@${target.id}> ahora es ${role === "capitan" ? "capitán" : "manager"} de **${team.name}**.`
        });
      }
    }

    if (commandName === "simular") {
      const firstName = interaction.options.getString("equipo1");
      const secondName = interaction.options.getString("equipo2");

      const home = findTeamByName(firstName);
      const away = findTeamByName(secondName);

      if (!home || !away) {
        return interaction.reply({
          content: "No se encontraron ambos equipos. Selecciónalos en las sugerencias.",
          ephemeral: true
        });
      }

      if (home.id === away.id) {
        return interaction.reply({
          content: "No puedes simular un partido de un equipo contra sí mismo.",
          ephemeral: true
        });
      }

      if (!home.members.length || !away.members.length) {
        return interaction.reply({
          content: "Ambos equipos deben tener al menos un jugador.",
          ephemeral: true
        });
      }

      await interaction.deferReply();

      const match = simulateMatch(home, away);
      return sendMatchReport(interaction, home, away, match);
    }

    if (commandName === "compra") {
      const user = interaction.options.getUser("jugador");
      const price = interaction.options.getInteger("precio");

      const buyerTeam = getPlayerTeam(interaction.user.id);
      const target = getPlayer(user.id);
      const sellerTeam = getPlayerTeam(user.id);

      if (!buyerTeam || !isManager(interaction.user.id, buyerTeam)) {
        return interaction.reply({
          content: "Solo el manager de un equipo puede presentar ofertas.",
          ephemeral: true
        });
      }

      if (!target || !sellerTeam) {
        return interaction.reply({
          content: "El jugador debe tener perfil y pertenecer a un equipo.",
          ephemeral: true
        });
      }

      if (sellerTeam.id === buyerTeam.id) {
        return interaction.reply({
          content: "No puedes comprar un jugador de tu propio equipo.",
          ephemeral: true
        });
      }

      if (buyerTeam.budget < price) {
        return interaction.reply({
          content: "Tu equipo no tiene presupuesto suficiente para esa oferta.",
          ephemeral: true
        });
      }

      const offerId = newId();

      data.offers[offerId] = {
        id: offerId,
        playerId: user.id,
        buyerTeamId: buyerTeam.id,
        sellerTeamId: sellerTeam.id,
        price,
        status: "pending",
        createdAt: Date.now()
      };

      saveData();

      const embed = createEmbed(
        "📩 Oferta de fichaje",
        `**Equipo comprador:** ${buyerTeam.name}\n` +
        `**Equipo vendedor:** ${sellerTeam.name}\n` +
        `**Jugador:** <@${user.id}>\n` +
        `**Oferta:** ${formatMoney(price)}\n\n` +
        "El jugador puede aceptar o rechazar la oferta. Si acepta, el dinero pasa al equipo vendedor.",
        0xf1c40f
      );

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`accept:${offerId}`)
          .setLabel("Aceptar")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`reject:${offerId}`)
          .setLabel("Rechazar")
          .setStyle(ButtonStyle.Danger)
      );

      try {
        await user.send({ embeds: [embed], components: [buttons] });
      } catch {
        return interaction.reply({
          content: "No pude enviar el mensaje privado al jugador. Debe habilitar sus mensajes directos para recibir la oferta. La oferta queda pendiente; vuelve a ejecutar `/compra` cuando pueda recibir mensajes.",
          ephemeral: true
        });
      }

      return interaction.reply({
        content: `📨 Oferta enviada a <@${user.id}>. Esperando su respuesta.`,
        ephemeral: true
      });
    }

    if (commandName === "remover") {
      if (!isHeadStaff(interaction.user.id)) {
        return interaction.reply({
          content: "⛔ Solo los miembros de Head Staff autorizados pueden usar este comando.",
          ephemeral: true
        });
      }

      const user = interaction.options.getUser("jugador");
      const reason = interaction.options.getString("motivo");
      const player = getPlayer(user.id);

      if (!player) {
        return interaction.reply({
          content: "Ese usuario no tiene un jugador registrado en la liga.",
          ephemeral: true
        });
      }

      const team = removeFromTeam(user.id);
      delete data.players[user.id];

      for (const offer of Object.values(data.offers)) {
        if (offer.playerId === user.id && offer.status === "pending") {
          offer.status = "cancelled";
        }
      }

      data.history.unshift({
        id: newId(),
        type: "player_removed",
        playerId: user.id,
        playerName: player.username,
        staffId: interaction.user.id,
        reason,
        date: Date.now()
      });

      saveData();

      return interaction.reply({
        embeds: [
          createEmbed(
            "🛡️ Jugador removido de la liga",
            `**Jugador:** <@${user.id}>\n` +
            `**Equipo anterior:** ${team ? team.name : "Agente libre"}\n` +
            `**Responsable:** <@${interaction.user.id}>\n` +
            `**Motivo:** ${reason}`,
            0xc0392b
          )
        ]
      });
    }

    if (commandName === "ayuda") {
      return interaction.reply({
        embeds: [
          createEmbed(
            "⚽ Nexyron Football — Comandos",
            [
              "`/jugador crear` — Crear futbolista.",
              "`/perfil` — Ver tu perfil o el de otro jugador.",
              "`/entrenar` — Mejorar un atributo cada 12 horas.",
              "`/equipo crear` — Crear equipo con 1.000.000 monedas.",
              "`/equipo info` — Ver plantilla y presupuesto.",
              "`/equipo fichar` — Fichar agentes libres.",
              "`/equipo cargo` — Asignar capitán o manager.",
              "`/compra` — Enviar oferta de traspaso.",
              "`/simular` — Partido entre dos equipos con narración y MVP.",
              "`/remover` — Eliminar un jugador (solo Head Staff)."
            ].join("\n"),
            0x3498db
          )
        ],
        ephemeral: true
      });
    }
  } catch (error) {
    console.error("Error procesando interacción:", error);

    const payload = {
      content: "Ocurrió un error al ejecutar el comando. Revisa la consola del bot.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

client.once("ready", () => {
  console.log(`Nexyron Football conectado como ${client.user.tag}`);
});

async function startBot() {
  if (!process.env.DISCORD_TOKEN) {
    throw new Error("Falta la variable DISCORD_TOKEN.");
  }

  if (!process.env.CLIENT_ID || !process.env.GUILD_ID) {
    throw new Error("Falta CLIENT_ID o GUILD_ID.");
  }

  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
}

startBot().catch(error => {
  console.error("No se pudo iniciar Nexyron Football:", error);
  process.exit(1);
});
