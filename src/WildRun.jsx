const { useEffect, useMemo, useState } = React;

const W = 16;
const H = 12;
const VISION = 4;

const ENEMIES = [
  { name: "Wolf", emoji: "🐺", hp: 8, dmg: 3, xp: 3 },
  { name: "Hawk", emoji: "🦅", hp: 6, dmg: 2, xp: 2 },
  { name: "Snake", emoji: "🐍", hp: 5, dmg: 2, xp: 2 },
  { name: "Bear", emoji: "🐻", hp: 14, dmg: 4, xp: 5 }
];
const FORAGE = [
  { name: "Berries", emoji: "🍓", heal: 3, terrain: ["meadow", "forest"] },
  { name: "Mushroom", emoji: "🍄", heal: 4, terrain: ["forest", "cave"] },
  { name: "Fish", emoji: "🐟", heal: 5, terrain: ["river"] },
  { name: "Nuts", emoji: "🌰", heal: 2, terrain: ["forest", "meadow"] }
];
const ABILITIES = {
  swiftPaws: { name: "Swift Paws", desc: "20% chance for a free extra move." },
  thickFur: { name: "Thick Fur", desc: "Reduce incoming damage by 1." },
  keenNose: { name: "Keen Nose", desc: "Reveal all forage." },
  forestHeart: { name: "Forest Heart", desc: "+1 HP regen after enemy turn." }
};

const ri = (n) => Math.floor(Math.random() * n);
const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

function makeMap() {
  const map = Array.from({ length: H }, () =>
    Array.from({ length: W }, () => {
      const r = Math.random();
      if (r < 0.3) return "forest";
      if (r < 0.8) return "meadow";
      return "cave";
    })
  );
  let x = ri(W);
  for (let y = 0; y < H; y += 1) {
    map[y][x] = "river";
    x += ri(3) - 1;
    x = Math.max(1, Math.min(W - 2, x));
  }
  return map;
}

function isBlocked(map, x, y) {
  return map[y][x] === "forest" || map[y][x] === "river";
}

function walkableNeighbors(map, x, y) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  return dirs.filter(([dx, dy]) => inBounds(x + dx, y + dy) && !isBlocked(map, x + dx, y + dy)).length;
}

function newGame(highScore) {
  const map = makeMap();
  const visited = Array.from({ length: H }, () => Array.from({ length: W }, () => false));
  const game = {
    floor: 1,
    score: 0,
    highScore,
    map,
    visited,
    player: { species: "Fox", emoji: "🦊", x: 0, y: 0, hp: 20, maxHp: 20, level: 1, xp: 0, xpToNext: 8, abilities: [] },
    enemies: [],
    items: [],
    exit: null,
    log: ["Tip: use keyboard or on-screen arrows."],
    gameOver: false,
    freeStep: false,
    levelChoices: null
  };

  const pickOpen = (preferWalkable = false) => {
    for (let i = 0; i < 400; i += 1) {
      const p = { x: ri(W), y: ri(H) };
      if (preferWalkable && isBlocked(map, p.x, p.y)) continue;
      if (preferWalkable && walkableNeighbors(map, p.x, p.y) === 0) continue;
      const occ = game.enemies.some((e) => e.x === p.x && e.y === p.y) ||
        game.items.some((it) => it.x === p.x && it.y === p.y) ||
        (game.exit && game.exit.x === p.x && game.exit.y === p.y) ||
        (game.player.x === p.x && game.player.y === p.y);
      if (!occ) return p;
    }
    return { x: 0, y: 0 };
  };

  const start = pickOpen(true);
  game.player.x = start.x;
  game.player.y = start.y;

  for (let i = 0; i < 5; i += 1) {
    const b = ENEMIES[ri(ENEMIES.length)];
    const p = pickOpen(true);
    game.enemies.push({ ...b, x: p.x, y: p.y, hp: b.hp });
  }
  for (let i = 0; i < 7; i += 1) {
    const p = pickOpen(false);
    const options = FORAGE.filter((f) => f.terrain.includes(map[p.y][p.x]));
    const it = options.length ? options[ri(options.length)] : FORAGE[0];
    game.items.push({ ...it, x: p.x, y: p.y });
  }
  game.exit = pickOpen(true);
  return game;
}

function WildRun() {
  const initialHigh = Number(localStorage.getItem("wild-run-high-score") || 0);
  const [game, setGame] = useState(() => newGame(initialHigh));

  const revealRadius = game.player.abilities.includes("keenNose") ? VISION + 1 : VISION;

  useEffect(() => {
    const onKey = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "w", "arrowdown", "s", "arrowleft", "a", "arrowright", "d", " "].includes(k)) e.preventDefault();
      if (["arrowup", "w"].includes(k)) move(0, -1);
      if (["arrowdown", "s"].includes(k)) move(0, 1);
      if (["arrowleft", "a"].includes(k)) move(-1, 0);
      if (["arrowright", "d"].includes(k)) move(1, 0);
      if (k === " ") move(0, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pushLog = (g, text) => { g.log = [text, ...g.log].slice(0, 60); };

  const maybeLevel = (g, xp) => {
    g.player.xp += xp;
    if (g.player.xp >= g.player.xpToNext) {
      g.player.xp -= g.player.xpToNext;
      g.player.level += 1;
      g.player.xpToNext += 4;
      const choices = Object.keys(ABILITIES).filter((k) => !g.player.abilities.includes(k)).slice(0, 3);
      g.levelChoices = choices.length ? choices : ["hp"];
    }
  };

  const move = (dx, dy) => setGame((prev) => {
    if (prev.gameOver || prev.levelChoices) return prev;
    const g = structuredClone(prev);
    const p = g.player;

    const reveal = () => {
      for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
        if (Math.abs(x - p.x) + Math.abs(y - p.y) <= revealRadius) g.visited[y][x] = true;
      }
    };

    if (dx !== 0 || dy !== 0) {
      const nx = p.x + dx;
      const ny = p.y + dy;
      if (!inBounds(nx, ny)) { pushLog(g, "Dense wilderness blocks your path."); reveal(); return g; }
      if (isBlocked(g.map, nx, ny)) { pushLog(g, g.map[ny][nx] === "river" ? "🌊 Water blocks your path." : "🌲 Trees block your path."); reveal(); return g; }

      const enemy = g.enemies.find((e) => e.x === nx && e.y === ny);
      if (enemy) {
        const dmg = 3 + Math.floor((p.level - 1) / 2);
        enemy.hp -= dmg;
        pushLog(g, `You hit ${enemy.name} for ${dmg}.`);
        if (enemy.hp <= 0) {
          g.enemies = g.enemies.filter((e) => e !== enemy);
          g.score += enemy.xp;
          maybeLevel(g, enemy.xp);
        }
      } else {
        p.x = nx; p.y = ny;
        const item = g.items.find((i) => i.x === nx && i.y === ny);
        if (item) {
          g.items = g.items.filter((i) => i !== item);
          p.hp = Math.min(p.maxHp, p.hp + item.heal);
          g.score += 1;
          maybeLevel(g, 1);
          pushLog(g, `Foraged ${item.emoji} ${item.name}.`);
        }
        if (g.exit.x === nx && g.exit.y === ny) {
          const high = Math.max(g.highScore, g.score);
          localStorage.setItem("wild-run-high-score", String(high));
          return newGame(high);
        }
      }
    }

    if (!(p.abilities.includes("swiftPaws") && Math.random() < 0.2 && !g.freeStep)) {
      g.freeStep = false;
      for (const e of g.enemies) {
        const d = dist(e, p);
        if (d === 1) {
          const hit = p.abilities.includes("thickFur") ? Math.max(1, e.dmg - 1) : e.dmg;
          p.hp -= hit;
          continue;
        }
        const mx = Math.sign(p.x - e.x);
        const my = Math.sign(p.y - e.y);
        const tx = e.x + (d <= 6 ? mx : ri(3) - 1);
        const ty = e.y + (d <= 6 ? my : ri(3) - 1);
        if (!inBounds(tx, ty) || isBlocked(g.map, tx, ty)) continue;
        if (tx === p.x && ty === p.y) continue;
        if (g.enemies.some((o) => o !== e && o.x === tx && o.y === ty)) continue;
        e.x = tx; e.y = ty;
      }
      if (p.abilities.includes("forestHeart") && p.hp < p.maxHp) p.hp += 1;
    } else {
      g.freeStep = true;
      pushLog(g, "⚡ Swift Paws! Extra action.");
    }

    if (p.hp <= 0) {
      g.gameOver = true;
      g.highScore = Math.max(g.highScore, g.score);
      localStorage.setItem("wild-run-high-score", String(g.highScore));
    }

    reveal();
    return g;
  });

  const chooseAbility = (key) => setGame((prev) => {
    const g = structuredClone(prev);
    if (key === "hp") {
      g.player.maxHp += 2;
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + 2);
    } else {
      g.player.abilities.push(key);
    }
    g.levelChoices = null;
    return g;
  });

  const abilities = useMemo(() => game.player.abilities.map((a) => ABILITIES[a].name).join(", ") || "None", [game.player.abilities]);

  return (
    <main className="layout">
      <section>
        <h1>🐾 Wild Run (React/JSX)</h1>
        <p className="subtitle">Arrow keys, WASD, or on-screen arrows.</p>
        <div id="game">
          {Array.from({ length: H }).map((_, y) =>
            Array.from({ length: W }).map((__, x) => {
              const terrain = game.map[y][x];
              const visible = Math.abs(x - game.player.x) + Math.abs(y - game.player.y) <= revealRadius;
              let glyph = "";
              if (visible) {
                const en = game.enemies.find((e) => e.x === x && e.y === y);
                const item = game.items.find((i) => i.x === x && i.y === y);
                if (game.player.x === x && game.player.y === y) glyph = game.player.emoji;
                else if (en) glyph = en.emoji;
                else if (item && (visible || game.player.abilities.includes("keenNose"))) glyph = item.emoji;
                else if (game.exit.x === x && game.exit.y === y) glyph = "🕳️";
                else glyph = terrain === "forest" ? "🌲" : terrain === "meadow" ? "🌿" : terrain === "river" ? "🌊" : "🪨";
              } else if (game.visited[y][x]) glyph = "·";
              return <div key={`${x}-${y}`} className={`tile ${terrain} ${game.visited[y][x] ? "" : "fog"}`}>{glyph}</div>;
            })
          )}
        </div>
      </section>

      <aside className="panel">
        <h2>Run Stats</h2>
        <ul id="stats">
          <li>Animal: {game.player.emoji} {game.player.species}</li>
          <li>HP: {game.player.hp}/{game.player.maxHp}</li>
          <li>Floor: {game.floor}</li>
          <li>Score: {game.score}</li>
          <li>High score: {game.highScore}</li>
          <li>Level: {game.player.level} ({game.player.xp}/{game.player.xpToNext} XP)</li>
          <li>Abilities: {abilities}</li>
        </ul>
        <div className="controls">
          <button onClick={() => move(0, 0)}>Wait</button>
          <button onClick={() => setGame(newGame(game.highScore))}>New Run</button>
        </div>
        <div className="dpad" aria-label="Touch controls">
          <button className="dpad-btn" onClick={() => move(0, -1)}>⬆️</button>
          <button className="dpad-btn" onClick={() => move(-1, 0)}>⬅️</button>
          <button className="dpad-btn" onClick={() => move(0, 1)}>⬇️</button>
          <button className="dpad-btn" onClick={() => move(1, 0)}>➡️</button>
        </div>

        <h2>Log</h2>
        <div id="log">{game.log.map((line, i) => <p className="log-line" key={i}>{line}</p>)}</div>
      </aside>

      {game.levelChoices && (
        <div className="modal">
          <div className="modal-content">
            <h3>Level up</h3>
            <div className="ability-grid">
              {game.levelChoices.map((key) => (
                <button className="ability-card" key={key} onClick={() => chooseAbility(key)}>
                  <strong>{key === "hp" ? "+2 Max HP" : ABILITIES[key].name}</strong>
                  <br />
                  <small>{key === "hp" ? "Fallback bonus." : ABILITIES[key].desc}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {game.gameOver && (
        <div className="modal">
          <div className="modal-content">
            <h3>💀 You fell on floor {game.floor}</h3>
            <p>Score: {game.score} | High score: {game.highScore}</p>
            <button onClick={() => setGame(newGame(game.highScore))}>Start Fresh</button>
          </div>
        </div>
      )}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<WildRun />);
