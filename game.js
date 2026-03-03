const WIDTH = 16;
const HEIGHT = 12;
const VISION_RADIUS = 4;
const TERRAIN_TYPES = ["meadow", "forest", "cave"];

const ENEMIES = [
  { name: "Wolf", emoji: "🐺", hp: 8, dmg: 3, xp: 3, glyph: "wolf" },
  { name: "Hawk", emoji: "🦅", hp: 6, dmg: 2, xp: 2, glyph: "hawk" },
  { name: "Snake", emoji: "🐍", hp: 5, dmg: 2, xp: 2, glyph: "snake" },
  { name: "Bear", emoji: "🐻", hp: 14, dmg: 4, xp: 5, glyph: "bear" }
];

const FORAGE = [
  { name: "Berries", emoji: "🫐", heal: 3, terrain: ["meadow", "forest"] },
  { name: "Mushroom", emoji: "🍄", heal: 4, terrain: ["forest", "cave"] },
  { name: "Fish", emoji: "🐟", heal: 5, terrain: ["river"] }
];

const ABILITIES = {
  swiftPaws: { name: "Swift Paws", desc: "20% chance each turn to gain one free extra step." },
  thickFur: { name: "Thick Fur", desc: "Reduce incoming damage by 1 (minimum 1)." },
  keenNose: { name: "Keen Nose", desc: "Sense forage up to 5 tiles away and reveal extra map radius." }
};

const state = {
  floor: 1,
  score: 0,
  highScore: Number(localStorage.getItem("wild-run-high-score") || 0),
  map: [],
  visited: [],
  player: null,
  enemies: [],
  items: [],
  log: [],
  gameOver: false,
  levelModalOpen: false,
  freeStep: false
};

const gameEl = document.getElementById("game");
const logEl = document.getElementById("log");
const statsEl = document.getElementById("stats");
const levelModal = document.getElementById("levelModal");
const abilityChoicesEl = document.getElementById("abilityChoices");
const deathModal = document.getElementById("deathModal");
const deathSummary = document.getElementById("deathSummary");

function randInt(max) { return Math.floor(Math.random() * max); }
function inBounds(x, y) { return x >= 0 && y >= 0 && x < WIDTH && y < HEIGHT; }
function distance(a, b) { return Math.abs(a.x - b.x) + Math.abs(a.y - b.y); }

function addLog(text, cls = "") {
  state.log.unshift({ text, cls });
  state.log = state.log.slice(0, 80);
}

function pickTerrain() {
  const roll = Math.random();
  if (roll < 0.45) return "forest";
  if (roll < 0.8) return "meadow";
  return "cave";
}

function generateMap() {
  state.map = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, pickTerrain));
  state.visited = Array.from({ length: HEIGHT }, () => Array.from({ length: WIDTH }, () => false));

  let riverX = randInt(WIDTH);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let w = -1; w <= 1; w += 1) {
      const x = riverX + w;
      if (x >= 0 && x < WIDTH) state.map[y][x] = "river";
    }
    riverX += randInt(3) - 1;
    riverX = Math.max(1, Math.min(WIDTH - 2, riverX));
  }
}

function randomOpenTile(preferNonRiver = false) {
  for (let i = 0; i < 200; i += 1) {
    const p = { x: randInt(WIDTH), y: randInt(HEIGHT) };
    const occupied = state.enemies.some((e) => e.x === p.x && e.y === p.y)
      || state.items.some((it) => it.x === p.x && it.y === p.y)
      || (state.player && state.player.x === p.x && state.player.y === p.y);
    if (occupied) continue;
    if (preferNonRiver && state.map[p.y][p.x] === "river") continue;
    return p;
  }
  return { x: 0, y: 0 };
}

function spawnEntities() {
  state.enemies = [];
  state.items = [];

  const enemyCount = 4 + state.floor;
  for (let i = 0; i < enemyCount; i += 1) {
    const base = ENEMIES[Math.min(ENEMIES.length - 1, randInt(ENEMIES.length + Math.floor(state.floor / 3))) % ENEMIES.length];
    const pos = randomOpenTile(true);
    state.enemies.push({
      ...base,
      hp: base.hp + Math.floor(state.floor / 2),
      x: pos.x,
      y: pos.y
    });
  }

  const itemCount = 6 + state.floor;
  for (let i = 0; i < itemCount; i += 1) {
    const pos = randomOpenTile(false);
    const terrain = state.map[pos.y][pos.x];
    const candidates = FORAGE.filter((f) => f.terrain.includes(terrain));
    const item = candidates.length ? candidates[randInt(candidates.length)] : FORAGE[0];
    state.items.push({ ...item, x: pos.x, y: pos.y });
  }
}

function startNewRun() {
  state.floor = 1;
  state.score = 0;
  state.gameOver = false;
  state.levelModalOpen = false;
  state.freeStep = false;
  state.player = {
    species: "Fox",
    emoji: "🦊",
    x: Math.floor(WIDTH / 2),
    y: Math.floor(HEIGHT / 2),
    hp: 20,
    maxHp: 20,
    level: 1,
    xp: 0,
    xpToNext: 8,
    abilities: []
  };
  state.log = [];
  addLog("A new run begins. You are a nimble fox in unknown wilderness.", "good");
  generateMap();
  spawnEntities();
  render();
}

function revealVisible() {
  const radius = state.player.abilities.includes("keenNose") ? VISION_RADIUS + 1 : VISION_RADIUS;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      if (Math.abs(x - state.player.x) + Math.abs(y - state.player.y) <= radius) {
        state.visited[y][x] = true;
      }
    }
  }
}

function enemyAt(x, y) {
  return state.enemies.find((e) => e.x === x && e.y === y);
}

function itemAt(x, y) {
  return state.items.find((it) => it.x === x && it.y === y);
}

function takeDamage(amount, source) {
  const reduced = state.player.abilities.includes("thickFur") ? Math.max(1, amount - 1) : amount;
  state.player.hp -= reduced;
  addLog(`${source} hits you for ${reduced}.`, "bad");
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    endRun();
  }
}

function gainXp(amount) {
  state.player.xp += amount;
  while (state.player.xp >= state.player.xpToNext) {
    state.player.xp -= state.player.xpToNext;
    state.player.level += 1;
    state.player.xpToNext += 4;
    showLevelChoices();
  }
}

function attackEnemy(enemy) {
  const dmg = 3 + Math.floor((state.player.level - 1) / 2);
  enemy.hp -= dmg;
  addLog(`You bite ${enemy.name} for ${dmg}.`, "good");
  if (enemy.hp <= 0) {
    state.enemies = state.enemies.filter((e) => e !== enemy);
    addLog(`${enemy.emoji} ${enemy.name} is defeated.`, "good");
    state.score += enemy.xp;
    gainXp(enemy.xp);
  }
}

function collectItem(item) {
  state.items = state.items.filter((it) => it !== item);
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + item.heal);
  state.score += 1;
  gainXp(1);
  addLog(`You forage ${item.emoji} ${item.name} and heal ${item.heal}.`, "good");
}

function maybeAdvanceFloor() {
  if (state.enemies.length > 0) return;
  state.floor += 1;
  state.score += 5;
  addLog(`🌲 You push deeper into the wild. Entering floor ${state.floor}.`, "good");
  generateMap();
  const pos = randomOpenTile(true);
  state.player.x = pos.x;
  state.player.y = pos.y;
  spawnEntities();
}

function handlePlayerAction(dx, dy) {
  if (state.gameOver || state.levelModalOpen) return;

  if (dx === 0 && dy === 0) {
    addLog("You wait and listen to the wind.");
  } else {
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    if (!inBounds(nx, ny)) {
      addLog("Dense wilderness blocks your path.");
      render();
      return;
    }

    const targetEnemy = enemyAt(nx, ny);
    if (targetEnemy) {
      attackEnemy(targetEnemy);
    } else {
      state.player.x = nx;
      state.player.y = ny;
      const pickup = itemAt(nx, ny);
      if (pickup) collectItem(pickup);
    }
  }

  if (state.gameOver || state.levelModalOpen) {
    render();
    return;
  }

  const procSwift = state.player.abilities.includes("swiftPaws") && Math.random() < 0.2;
  if (procSwift && !state.freeStep) {
    state.freeStep = true;
    addLog("⚡ Swift Paws! You may act once more before enemies move.", "good");
  } else {
    state.freeStep = false;
    enemyTurn();
    maybeAdvanceFloor();
  }

  render();
}

function enemyTurn() {
  for (const enemy of state.enemies) {
    if (state.gameOver) break;

    const dist = distance(enemy, state.player);
    if (dist === 1) {
      takeDamage(enemy.dmg + Math.floor(state.floor / 3), enemy.name);
      continue;
    }

    let dx = 0;
    let dy = 0;
    if (dist <= 6) {
      dx = Math.sign(state.player.x - enemy.x);
      dy = Math.sign(state.player.y - enemy.y);
      if (Math.random() < 0.35) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
    } else {
      dx = randInt(3) - 1;
      dy = randInt(3) - 1;
    }

    const tx = enemy.x + dx;
    const ty = enemy.y + dy;
    if (!inBounds(tx, ty)) continue;
    if (tx === state.player.x && ty === state.player.y) {
      takeDamage(enemy.dmg + Math.floor(state.floor / 3), enemy.name);
      continue;
    }
    if (enemyAt(tx, ty)) continue;
    enemy.x = tx;
    enemy.y = ty;
  }
}

function showLevelChoices() {
  state.levelModalOpen = true;
  levelModal.classList.remove("hidden");
  abilityChoicesEl.innerHTML = "";

  const missing = Object.entries(ABILITIES).filter(([key]) => !state.player.abilities.includes(key));
  const picks = missing.sort(() => Math.random() - 0.5).slice(0, 3);

  if (!picks.length) {
    state.player.maxHp += 2;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 2);
    addLog("Level up bonus: +2 max HP.", "good");
    closeLevelModal();
    return;
  }

  picks.forEach(([key, data]) => {
    const btn = document.createElement("button");
    btn.className = "ability-card";
    btn.innerHTML = `<strong>${data.name}</strong><br><small>${data.desc}</small>`;
    btn.addEventListener("click", () => {
      state.player.abilities.push(key);
      addLog(`You learned ${data.name}.`, "good");
      closeLevelModal();
      render();
    });
    abilityChoicesEl.appendChild(btn);
  });
}

function closeLevelModal() {
  state.levelModalOpen = false;
  levelModal.classList.add("hidden");
}

function endRun() {
  state.gameOver = true;
  if (state.score > state.highScore) {
    state.highScore = state.score;
    localStorage.setItem("wild-run-high-score", String(state.highScore));
    addLog("🏆 New high score!", "good");
  }
  deathSummary.textContent = `You reached floor ${state.floor} with score ${state.score}. High score: ${state.highScore}.`;
  deathModal.classList.remove("hidden");
}

function directionToNearestItem() {
  if (!state.player.abilities.includes("keenNose")) return "None";
  let nearest = null;
  for (const item of state.items) {
    const d = distance(item, state.player);
    if (d > 5) continue;
    if (!nearest || d < nearest.d) nearest = { item, d };
  }
  if (!nearest) return "No scent nearby";
  const dx = nearest.item.x - state.player.x;
  const dy = nearest.item.y - state.player.y;
  const h = dx === 0 ? "" : dx > 0 ? "E" : "W";
  const v = dy === 0 ? "" : dy > 0 ? "S" : "N";
  return `${v}${h || ""} (${nearest.d})`;
}

function render() {
  revealVisible();
  gameEl.innerHTML = "";

  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const tile = document.createElement("div");
      const terrain = state.map[y][x];
      tile.className = `tile ${terrain}`;
      const visible = Math.abs(x - state.player.x) + Math.abs(y - state.player.y) <= (state.player.abilities.includes("keenNose") ? VISION_RADIUS + 1 : VISION_RADIUS);
      if (!state.visited[y][x]) tile.classList.add("fog");

      if (visible) {
        const enemy = enemyAt(x, y);
        const item = itemAt(x, y);
        if (state.player.x === x && state.player.y === y) tile.textContent = state.player.emoji;
        else if (enemy) tile.textContent = enemy.emoji;
        else if (item) tile.textContent = item.emoji;
        else tile.textContent = terrain === "forest" ? "🌲" : terrain === "meadow" ? "🌿" : terrain === "river" ? "🌊" : "🪨";
      } else if (state.visited[y][x]) {
        tile.textContent = "·";
      }

      gameEl.appendChild(tile);
    }
  }

  const abilities = state.player.abilities.map((a) => ABILITIES[a].name).join(", ") || "None";
  statsEl.innerHTML = `
    <li>Animal: ${state.player.emoji} ${state.player.species}</li>
    <li>HP: ${state.player.hp} / ${state.player.maxHp}</li>
    <li>Floor: ${state.floor}</li>
    <li>Score: ${state.score}</li>
    <li>High Score: ${state.highScore}</li>
    <li>Level: ${state.player.level} (${state.player.xp}/${state.player.xpToNext} XP)</li>
    <li>Abilities: ${abilities}</li>
    <li>Keen Nose: ${directionToNearestItem()}</li>
    <li>${state.freeStep ? "⚡ Extra step ready" : ""}</li>
  `;

  logEl.innerHTML = state.log.map((line) => `<p class="log-line ${line.cls}">${line.text}</p>`).join("");
}

document.getElementById("waitBtn").addEventListener("click", () => handlePlayerAction(0, 0));
document.getElementById("newRunBtn").addEventListener("click", () => {
  deathModal.classList.add("hidden");
  startNewRun();
});
document.getElementById("restartBtn").addEventListener("click", () => {
  deathModal.classList.add("hidden");
  startNewRun();
});

window.addEventListener("keydown", (event) => {
  if (state.gameOver || state.levelModalOpen) return;
  const key = event.key.toLowerCase();
  if (["arrowup", "w"].includes(key)) return handlePlayerAction(0, -1);
  if (["arrowdown", "s"].includes(key)) return handlePlayerAction(0, 1);
  if (["arrowleft", "a"].includes(key)) return handlePlayerAction(-1, 0);
  if (["arrowright", "d"].includes(key)) return handlePlayerAction(1, 0);
  if (key === " ") return handlePlayerAction(0, 0);
});

startNewRun();
