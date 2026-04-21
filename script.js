const canvas = document.getElementById('arena');
const ctx = canvas.getContext('2d');

const hpEl = document.getElementById('hp');
const creditsEl = document.getElementById('credits');
const waveEl = document.getElementById('wave');
const fireRateEl = document.getElementById('fire-rate');
const messageEl = document.getElementById('message');
const pauseBtn = document.getElementById('pause-btn');
const restartBtn = document.getElementById('restart-btn');
const upgradeButtons = Array.from(document.querySelectorAll('.upgrade'));

const costEls = {
  damage: document.getElementById('cost-damage'),
  speed: document.getElementById('cost-speed'),
  heal: document.getElementById('cost-heal'),
};

const tower = { x: canvas.width / 2, y: canvas.height - 80, radius: 24 };

let game;
let pointer = { active: false, x: tower.x, y: 0 };
let lastFrame = performance.now();

function createGame() {
  return {
    hp: 100,
    credits: 80,
    wave: 1,
    enemiesSpawned: 0,
    enemiesToSpawn: 8,
    spawnCooldown: 0,
    spawnInterval: 1,
    enemies: [],
    bullets: [],
    fireCooldown: 0,
    aimAngle: -Math.PI / 2,
    paused: false,
    over: false,
    upgrades: {
      damage: { level: 1, cost: 25 },
      speed: { level: 1, cost: 30 },
      heal: { level: 0, cost: 35 },
    },
  };
}

function enemyForWave(wave) {
  const hp = 7 + wave * 3 + Math.random() * (2 + wave);
  return {
    x: Math.random() * (canvas.width - 60) + 30,
    y: -30,
    radius: 15 + Math.min(10, wave * 0.4),
    hp,
    maxHp: hp,
    speed: 32 + wave * 3 + Math.random() * 10,
    reward: 8 + Math.floor(wave * 1.2),
  };
}

function trySpawnEnemy(dt) {
  if (game.enemiesSpawned >= game.enemiesToSpawn) {
    return;
  }
  game.spawnCooldown -= dt;
  if (game.spawnCooldown <= 0) {
    game.enemies.push(enemyForWave(game.wave));
    game.enemiesSpawned += 1;
    const cadence = Math.max(0.28, game.spawnInterval - game.wave * 0.03);
    game.spawnCooldown = cadence;
  }
}

function fireRate() {
  return 1 * (1 + (game.upgrades.speed.level - 1) * 0.15);
}

function towerDamage() {
  return 4 + (game.upgrades.damage.level - 1);
}

function aimTowardPointer() {
  if (!pointer.active) {
    return;
  }
  const dx = pointer.x - tower.x;
  const dy = pointer.y - tower.y;
  game.aimAngle = Math.atan2(dy, dx);
}

function shoot(dt) {
  game.fireCooldown -= dt;
  if (game.fireCooldown > 0) {
    return;
  }

  const target = game.enemies.reduce((best, enemy) => {
    if (!best) return enemy;
    const bestDist = (best.x - tower.x) ** 2 + (best.y - tower.y) ** 2;
    const dist = (enemy.x - tower.x) ** 2 + (enemy.y - tower.y) ** 2;
    return dist < bestDist ? enemy : best;
  }, null);

  if (!target) {
    return;
  }

  const angle = Math.atan2(target.y - tower.y, target.x - tower.x);
  game.aimAngle = angle;
  game.bullets.push({
    x: tower.x + Math.cos(angle) * 26,
    y: tower.y + Math.sin(angle) * 26,
    vx: Math.cos(angle) * 460,
    vy: Math.sin(angle) * 460,
    radius: 5,
    damage: towerDamage(),
  });
  game.fireCooldown = 1 / fireRate();
}

function updateBullets(dt) {
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
  }
  game.bullets = game.bullets.filter(
    (bullet) => bullet.x > -20 && bullet.x < canvas.width + 20 && bullet.y > -30 && bullet.y < canvas.height + 20,
  );
}

function resolveHits() {
  for (const bullet of game.bullets) {
    for (const enemy of game.enemies) {
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - enemy.y;
      if (dx * dx + dy * dy <= (bullet.radius + enemy.radius) ** 2) {
        enemy.hp -= bullet.damage;
        bullet.hit = true;
        break;
      }
    }
  }
  game.bullets = game.bullets.filter((bullet) => !bullet.hit);

  const survivors = [];
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0) {
      game.credits += enemy.reward;
    } else {
      survivors.push(enemy);
    }
  }
  game.enemies = survivors;
}

function updateEnemies(dt) {
  for (const enemy of game.enemies) {
    const dx = tower.x - enemy.x;
    const dy = tower.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.x += (dx / distance) * enemy.speed * dt;
    enemy.y += (dy / distance) * enemy.speed * dt;

    if (distance < tower.radius + enemy.radius) {
      game.hp -= Math.max(5, enemy.maxHp * 0.55);
      enemy.hp = -1;
    }
  }
}

function maybeAdvanceWave() {
  if (game.enemies.length > 0 || game.enemiesSpawned < game.enemiesToSpawn) {
    return;
  }
  game.wave += 1;
  game.enemiesSpawned = 0;
  game.enemiesToSpawn = 8 + game.wave * 2;
  game.spawnCooldown = 1.2;
  messageEl.textContent = `Wave ${game.wave} incoming!`;
}

function updateHud() {
  hpEl.textContent = String(Math.max(0, Math.floor(game.hp)));
  creditsEl.textContent = String(game.credits);
  waveEl.textContent = String(game.wave);
  fireRateEl.textContent = `${fireRate().toFixed(1)}/s`;

  for (const [name, data] of Object.entries(game.upgrades)) {
    costEls[name].textContent = String(data.cost);
  }

  for (const button of upgradeButtons) {
    const type = button.dataset.upgrade;
    button.classList.toggle('locked', game.credits < game.upgrades[type].cost || game.over);
    button.disabled = game.over;
  }
}

function drawArena() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0a1f44');
  gradient.addColorStop(1, '#020617');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
  for (let y = 30; y < canvas.height; y += 34) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawTower() {
  ctx.save();
  ctx.translate(tower.x, tower.y);
  ctx.rotate(game.aimAngle);

  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(0, 0, tower.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(8, -6, 28, 12);

  ctx.restore();
}

function drawEnemies() {
  for (const enemy of game.enemies) {
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
    ctx.fill();

    const barW = enemy.radius * 1.7;
    const ratio = Math.max(0, enemy.hp / enemy.maxHp);
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 13, barW, 4);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(enemy.x - barW / 2, enemy.y - enemy.radius - 13, barW * ratio, 4);
  }
}

function drawBullets() {
  ctx.fillStyle = '#facc15';
  for (const bullet of game.bullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  drawArena();
  drawTower();
  drawEnemies();
  drawBullets();
}

function endGame() {
  game.over = true;
  game.paused = true;
  messageEl.textContent = `Core destroyed at wave ${game.wave}.`;
  restartBtn.hidden = false;
  pauseBtn.textContent = 'Paused';
}

function tick(now) {
  const dt = Math.min(0.033, (now - lastFrame) / 1000);
  lastFrame = now;

  if (!game.paused && !game.over) {
    aimTowardPointer();
    trySpawnEnemy(dt);
    shoot(dt);
    updateBullets(dt);
    updateEnemies(dt);
    resolveHits();
    maybeAdvanceWave();

    if (game.hp <= 0) {
      endGame();
    }
  }

  updateHud();
  draw();
  requestAnimationFrame(tick);
}

function onPointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
  pointer.y = ((event.clientY - rect.top) / rect.height) * canvas.height;
}

canvas.addEventListener('pointerdown', (event) => {
  pointer.active = true;
  onPointerMove(event);
});

canvas.addEventListener('pointermove', (event) => {
  if (pointer.active) {
    onPointerMove(event);
  }
});

window.addEventListener('pointerup', () => {
  pointer.active = false;
});

pauseBtn.addEventListener('click', () => {
  if (game.over) {
    return;
  }
  game.paused = !game.paused;
  pauseBtn.textContent = game.paused ? 'Resume' : 'Pause';
  messageEl.textContent = game.paused
    ? 'Paused. Tap Resume to continue.'
    : 'Tap and hold to guide your aim while the tower auto-fires.';
});

upgradeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    if (game.over) {
      return;
    }
    const type = button.dataset.upgrade;
    const upgrade = game.upgrades[type];
    if (game.credits < upgrade.cost) {
      messageEl.textContent = 'Not enough credits for that upgrade.';
      return;
    }

    game.credits -= upgrade.cost;
    if (type === 'heal') {
      game.hp = Math.min(100, game.hp + 15);
    }
    upgrade.level += 1;
    upgrade.cost = Math.round(upgrade.cost * 1.45 + (type === 'heal' ? 5 : 0));
    messageEl.textContent = `${type[0].toUpperCase()}${type.slice(1)} upgraded!`;
  });
});

restartBtn.addEventListener('click', () => {
  game = createGame();
  restartBtn.hidden = true;
  pauseBtn.textContent = 'Pause';
  messageEl.textContent = 'New run started. Hold and drag to aim.';
});

game = createGame();
requestAnimationFrame((now) => {
  lastFrame = now;
  tick(now);
});
