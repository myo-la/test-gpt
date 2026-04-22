const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');

const galaxyEl = document.getElementById('galaxy');
const energyEl = document.getElementById('energy');
const oreEl = document.getElementById('ore');
const crystalEl = document.getElementById('crystal');
const beamEl = document.getElementById('beam-level');
const toolNameEl = document.getElementById('tool-name');
const messageEl = document.getElementById('message');
const travelTargetEl = document.getElementById('travel-target');

const pauseBtn = document.getElementById('pause-btn');
const labToggleBtn = document.getElementById('lab-toggle');
const travelBtn = document.getElementById('travel-btn');
const toolButtons = Array.from(document.querySelectorAll('.tool'));
const labButtons = Array.from(document.querySelectorAll('.lab-upgrade'));
const labPanel = document.getElementById('lab-panel');
const labQueueEl = document.getElementById('lab-queue');

const SHIP_RADIUS = 18;
const TOOL_STATS = {
  laser: { name: 'Laser Drill', damage: 16, energy: 8, range: 180 },
  plasma: { name: 'Plasma Cutter', damage: 28, energy: 14, range: 200 },
  quantum: { name: 'Quantum Fracturer', damage: 42, energy: 20, range: 215 },
};

let game;
let lastFrame = performance.now();

function createGame() {
  return {
    galaxy: 1,
    ore: 0,
    crystal: 0,
    energy: 100,
    maxEnergy: 100,
    beamLevel: 1,
    scannerLevel: 1,
    batteryLevel: 1,
    selectedTool: 'laser',
    paused: false,
    ship: {
      x: canvas.width / 2,
      y: canvas.height - 100,
      tx: canvas.width / 2,
      ty: canvas.height - 100,
      speed: 200,
    },
    asteroids: [],
    asteroidSpawnTimer: 0,
    beamTargetId: null,
    labQueue: [],
    nextAsteroidId: 1,
  };
}

function travelRequirement() {
  const oreNeed = 150 + (game.galaxy - 1) * 95;
  const crystalNeed = 40 + (game.galaxy - 1) * 32;
  return { oreNeed, crystalNeed };
}

function createAsteroid() {
  const tier = Math.min(5, Math.ceil(Math.random() * (1 + game.galaxy * 0.75)));
  const radius = 20 + tier * 4 + Math.random() * 8;
  const toughness = 42 + tier * 26 + game.galaxy * 18;
  return {
    id: game.nextAsteroidId++,
    x: Math.random() * (canvas.width - 2 * radius) + radius,
    y: -radius,
    vx: (Math.random() - 0.5) * 20,
    vy: 20 + tier * 5 + game.galaxy * 7,
    radius,
    hp: toughness,
    maxHp: toughness,
    oreYield: 9 + tier * 6 + game.galaxy * 4,
    crystalYield: tier >= 3 ? Math.floor(2 + tier + Math.random() * 4) : Math.floor(Math.random() * 2),
    captured: false,
  };
}

function spawnAsteroids(dt) {
  game.asteroidSpawnTimer -= dt;
  if (game.asteroidSpawnTimer > 0) {
    return;
  }
  game.asteroidSpawnTimer = Math.max(0.45, 1.8 - game.galaxy * 0.12);
  game.asteroids.push(createAsteroid());
}

function updateShip(dt) {
  const ship = game.ship;
  const dx = ship.tx - ship.x;
  const dy = ship.ty - ship.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1) {
    return;
  }
  const step = Math.min(distance, ship.speed * dt);
  ship.x += (dx / distance) * step;
  ship.y += (dy / distance) * step;
}

function updateAsteroids(dt) {
  for (const asteroid of game.asteroids) {
    const ship = game.ship;
    if (asteroid.id === game.beamTargetId) {
      asteroid.captured = true;
      const pull = 140 + game.beamLevel * 45;
      const dx = ship.x - asteroid.x;
      const dy = ship.y - asteroid.y;
      const dist = Math.hypot(dx, dy) || 1;
      asteroid.vx += (dx / dist) * pull * dt;
      asteroid.vy += (dy / dist) * pull * dt;
      asteroid.vx *= 0.97;
      asteroid.vy *= 0.97;

      if (dist < TOOL_STATS[game.selectedTool].range) {
        mineAsteroid(asteroid, dt);
      }
    } else {
      asteroid.captured = false;
    }

    asteroid.x += asteroid.vx * dt;
    asteroid.y += asteroid.vy * dt;
  }

  game.asteroids = game.asteroids.filter((asteroid) => {
    const out = asteroid.y - asteroid.radius > canvas.height + 40 || asteroid.x < -80 || asteroid.x > canvas.width + 80;
    if (out && asteroid.id === game.beamTargetId) {
      game.beamTargetId = null;
    }
    return !out;
  });
}

function mineAsteroid(asteroid, dt) {
  const tool = TOOL_STATS[game.selectedTool];
  if (game.energy <= 0) {
    return;
  }

  const damagePerSecond = tool.damage * (1 + (game.scannerLevel - 1) * 0.08);
  asteroid.hp -= damagePerSecond * dt;
  game.energy = Math.max(0, game.energy - tool.energy * dt);

  if (asteroid.hp <= 0) {
    const oreGain = Math.round(asteroid.oreYield * (1 + (game.scannerLevel - 1) * 0.12));
    const crystalGain = Math.round(asteroid.crystalYield * (1 + (game.scannerLevel - 1) * 0.06));
    game.ore += oreGain;
    game.crystal += crystalGain;
    messageEl.textContent = `Mined +${oreGain} ore and +${crystalGain} crystal.`;
    if (asteroid.id === game.beamTargetId) {
      game.beamTargetId = null;
    }
    asteroid.destroyed = true;
  }
}

function regenerateEnergy(dt) {
  const rate = 8 + game.batteryLevel * 2.4;
  game.energy = Math.min(game.maxEnergy, game.energy + rate * dt);
}

function updateLabQueue(dt) {
  for (const project of game.labQueue) {
    project.remaining -= dt;
  }

  const completed = game.labQueue.filter((project) => project.remaining <= 0);
  for (const project of completed) {
    if (project.type === 'beam') {
      game.beamLevel += 1;
    } else if (project.type === 'scanner') {
      game.scannerLevel += 1;
    } else if (project.type === 'battery') {
      game.batteryLevel += 1;
      game.maxEnergy += 24;
      game.energy = Math.min(game.maxEnergy, game.energy + 24);
    }
    messageEl.textContent = `${project.label} research complete.`;
  }

  game.labQueue = game.labQueue.filter((project) => project.remaining > 0);
}

function drawBackground() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#0a1f44');
  grad.addColorStop(1, '#010713');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 30; i += 1) {
    const x = (i * 59 + game.galaxy * 37) % canvas.width;
    const y = (i * 97 + performance.now() * 0.02) % canvas.height;
    ctx.fillStyle = 'rgba(191,219,254,0.25)';
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawShip() {
  const ship = game.ship;
  ctx.save();
  ctx.translate(ship.x, ship.y);

  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.moveTo(0, -SHIP_RADIUS - 8);
  ctx.lineTo(SHIP_RADIUS * 0.8, SHIP_RADIUS);
  ctx.lineTo(-SHIP_RADIUS * 0.8, SHIP_RADIUS);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  ctx.arc(0, 2, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAsteroids() {
  for (const asteroid of game.asteroids) {
    if (asteroid.destroyed) {
      continue;
    }
    ctx.fillStyle = asteroid.id === game.beamTargetId ? '#facc15' : '#94a3b8';
    ctx.beginPath();
    ctx.arc(asteroid.x, asteroid.y, asteroid.radius, 0, Math.PI * 2);
    ctx.fill();

    const ratio = Math.max(0, asteroid.hp / asteroid.maxHp);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    ctx.fillRect(asteroid.x - asteroid.radius, asteroid.y - asteroid.radius - 11, asteroid.radius * 2, 4);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(asteroid.x - asteroid.radius, asteroid.y - asteroid.radius - 11, asteroid.radius * 2 * ratio, 4);
  }
}

function drawTractorBeam() {
  const target = game.asteroids.find((item) => item.id === game.beamTargetId);
  if (!target || target.destroyed) {
    return;
  }
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.8)';
  ctx.lineWidth = 2 + game.beamLevel * 0.4;
  ctx.beginPath();
  ctx.moveTo(game.ship.x, game.ship.y - 10);
  ctx.lineTo(target.x, target.y);
  ctx.stroke();
}

function drawTravelMarker() {
  const { oreNeed, crystalNeed } = travelRequirement();
  const ready = game.ore >= oreNeed && game.crystal >= crystalNeed;
  if (!ready) {
    return;
  }
  ctx.fillStyle = 'rgba(167, 139, 250, 0.45)';
  ctx.beginPath();
  ctx.arc(canvas.width - 50, 65, 32, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ede9fe';
  ctx.font = '12px sans-serif';
  ctx.fillText('JUMP', canvas.width - 66, 69);
}

function draw() {
  drawBackground();
  drawTravelMarker();
  drawTractorBeam();
  drawAsteroids();
  drawShip();
}

function updateHud() {
  galaxyEl.textContent = String(game.galaxy);
  energyEl.textContent = `${Math.round(game.energy)} / ${game.maxEnergy}`;
  oreEl.textContent = String(game.ore);
  crystalEl.textContent = String(game.crystal);
  beamEl.textContent = `Mk ${['I', 'II', 'III', 'IV', 'V', 'VI'][Math.min(5, game.beamLevel - 1)] || game.beamLevel}`;
  toolNameEl.textContent = TOOL_STATS[game.selectedTool].name;

  const { oreNeed, crystalNeed } = travelRequirement();
  travelTargetEl.textContent = `${oreNeed} ore + ${crystalNeed} crystal`;

  toolButtons.forEach((btn) => {
    const tool = btn.dataset.tool;
    btn.classList.toggle('active', tool === game.selectedTool);
  });

  const canTravel = game.ore >= oreNeed && game.crystal >= crystalNeed;
  travelBtn.classList.toggle('locked', !canTravel);

  renderLabQueue();
}

function tick(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!game.paused) {
    spawnAsteroids(dt);
    updateShip(dt);
    updateAsteroids(dt);
    game.asteroids = game.asteroids.filter((asteroid) => !asteroid.destroyed);
    regenerateEnergy(dt);
    updateLabQueue(dt);
  }

  draw();
  updateHud();
  requestAnimationFrame(tick);
}

function asteroidAt(x, y) {
  for (let i = game.asteroids.length - 1; i >= 0; i -= 1) {
    const asteroid = game.asteroids[i];
    const dx = x - asteroid.x;
    const dy = y - asteroid.y;
    if (dx * dx + dy * dy <= asteroid.radius * asteroid.radius) {
      return asteroid;
    }
  }
  return null;
}

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

  const target = asteroidAt(x, y);
  if (target) {
    game.beamTargetId = target.id;
    messageEl.textContent = 'Asteroid captured in tractor beam.';
    return;
  }

  game.ship.tx = x;
  game.ship.ty = Math.min(canvas.height - 40, Math.max(80, y));
  messageEl.textContent = 'Course updated.';
});

pauseBtn.addEventListener('click', () => {
  game.paused = !game.paused;
  pauseBtn.textContent = game.paused ? 'Resume' : 'Pause';
  messageEl.textContent = game.paused ? 'Simulation paused.' : 'Simulation resumed.';
});

toolButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const tool = btn.dataset.tool;
    if (tool === 'plasma' && game.ore < 20) {
      messageEl.textContent = 'Need 20 ore to equip Plasma Cutter.';
      return;
    }
    if (tool === 'quantum' && (game.ore < 35 || game.crystal < 12)) {
      messageEl.textContent = 'Need 35 ore and 12 crystal to equip Quantum Fracturer.';
      return;
    }
    game.selectedTool = tool;
    messageEl.textContent = `${TOOL_STATS[tool].name} equipped.`;
  });
});

travelBtn.addEventListener('click', () => {
  const { oreNeed, crystalNeed } = travelRequirement();
  if (game.ore < oreNeed || game.crystal < crystalNeed) {
    messageEl.textContent = 'Collect more resources to jump galaxies.';
    return;
  }

  game.ore -= oreNeed;
  game.crystal -= crystalNeed;
  game.galaxy += 1;
  game.beamTargetId = null;
  game.asteroids = [];
  game.ship.tx = canvas.width / 2;
  game.ship.ty = canvas.height - 100;
  game.ship.x = game.ship.tx;
  game.ship.y = game.ship.ty;
  messageEl.textContent = `Jumped to Galaxy ${game.galaxy}. Asteroids are tougher now.`;
});

labToggleBtn.addEventListener('click', () => {
  labPanel.hidden = !labPanel.hidden;
  labToggleBtn.textContent = labPanel.hidden ? 'Ship Lab' : 'Close Lab';
});

function projectTemplate(type) {
  const level = type === 'beam' ? game.beamLevel : type === 'scanner' ? game.scannerLevel : game.batteryLevel;
  if (type === 'beam') {
    return {
      type,
      label: `Beam Focus Mk ${level + 1}`,
      costOre: 45 + level * 22,
      costCrystal: 0,
      duration: 10 + level * 4,
    };
  }
  if (type === 'scanner') {
    return {
      type,
      label: `Deep Scanner v${level + 1}`,
      costOre: 30 + level * 18,
      costCrystal: 10 + level * 8,
      duration: 12 + level * 5,
    };
  }
  return {
    type,
    label: `Fusion Battery Gen ${level + 1}`,
    costOre: 50 + level * 26,
    costCrystal: 20 + level * 10,
    duration: 14 + level * 5,
  };
}

function enqueueProject(type) {
  const project = projectTemplate(type);
  if (game.ore < project.costOre || game.crystal < project.costCrystal) {
    messageEl.textContent = 'Not enough resources for that laboratory project.';
    return;
  }
  game.ore -= project.costOre;
  game.crystal -= project.costCrystal;
  game.labQueue.push({ ...project, remaining: project.duration });
  messageEl.textContent = `${project.label} queued in laboratory.`;
}

labButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    enqueueProject(btn.dataset.lab);
  });
});

function renderLabQueue() {
  if (game.labQueue.length === 0) {
    labQueueEl.innerHTML = '<li>No active projects.</li>';
    return;
  }

  labQueueEl.innerHTML = game.labQueue
    .map((project) => `<li>${project.label} - ${Math.max(1, Math.ceil(project.remaining))}s remaining</li>`)
    .join('');
}

game = createGame();
renderLabQueue();
requestAnimationFrame((now) => {
  lastFrame = now;
  tick(now);
});
