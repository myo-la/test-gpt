const PRESETS = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
  custom: null,
};

const boardEl = document.getElementById('board');
const messageEl = document.getElementById('message');
const mineCountEl = document.getElementById('mine-count');
const timerEl = document.getElementById('timer');
const rowsInput = document.getElementById('rows');
const colsInput = document.getElementById('cols');
const minesInput = document.getElementById('mines');
const newGameBtn = document.getElementById('new-game');
const resetFaceBtn = document.getElementById('reset-face');
const presetButtons = Array.from(document.querySelectorAll('.preset'));

let state;
let timerId;

function neighbors(row, col, rows, cols) {
  const items = [];
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      if ((r !== row || c !== col) && r >= 0 && c >= 0 && r < rows && c < cols) {
        items.push([r, c]);
      }
    }
  }
  return items;
}

function createCell() {
  return { mine: false, revealed: false, flagged: false, count: 0, exploded: false, wrongFlag: false };
}

function createState(rows, cols, mines) {
  return {
    rows,
    cols,
    mines,
    board: Array.from({ length: rows }, () => Array.from({ length: cols }, createCell)),
    gameOver: false,
    won: false,
    firstMove: true,
    startedAt: null,
    elapsed: 0,
    level: 'custom',
  };
}

function placeMines(safeRow, safeCol) {
  const forbidden = new Set([`${safeRow},${safeCol}`]);
  for (const [r, c] of neighbors(safeRow, safeCol, state.rows, state.cols)) {
    forbidden.add(`${r},${c}`);
  }

  let placed = 0;
  while (placed < state.mines) {
    const idx = Math.floor(Math.random() * state.rows * state.cols);
    const row = Math.floor(idx / state.cols);
    const col = idx % state.cols;
    const key = `${row},${col}`;
    const cell = state.board[row][col];
    if (!forbidden.has(key) && !cell.mine) {
      cell.mine = true;
      placed += 1;
    }
  }

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      state.board[row][col].count = neighbors(row, col, state.rows, state.cols)
        .filter(([nr, nc]) => state.board[nr][nc].mine).length;
    }
  }
}

function startTimer() {
  if (timerId || state.gameOver) {
    return;
  }
  state.startedAt = Date.now() - state.elapsed * 1000;
  timerId = setInterval(() => {
    state.elapsed = Math.min(999, Math.floor((Date.now() - state.startedAt) / 1000));
    timerEl.textContent = String(state.elapsed).padStart(3, '0');
  }, 250);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
}

function revealAllMines(triggeredRow, triggeredCol) {
  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const cell = state.board[row][col];
      if (cell.mine) {
        cell.revealed = true;
      }
      if (!cell.mine && cell.flagged) {
        cell.wrongFlag = true;
      }
      if (row === triggeredRow && col === triggeredCol) {
        cell.exploded = true;
      }
    }
  }
}

function floodReveal(startRow, startCol) {
  const queue = [[startRow, startCol]];
  while (queue.length > 0) {
    const [row, col] = queue.shift();
    const cell = state.board[row][col];
    if (cell.revealed || cell.flagged) {
      continue;
    }
    cell.revealed = true;
    if (cell.count === 0) {
      for (const [nr, nc] of neighbors(row, col, state.rows, state.cols)) {
        const next = state.board[nr][nc];
        if (!next.revealed && !next.flagged && !next.mine) {
          queue.push([nr, nc]);
        }
      }
    }
  }
}

function handleLoss(row, col) {
  state.gameOver = true;
  state.won = false;
  stopTimer();
  revealAllMines(row, col);
  messageEl.textContent = '💥 Boom! Click 🙂 to try again.';
  resetFaceBtn.textContent = '😵';
}

function handleWin() {
  state.gameOver = true;
  state.won = true;
  stopTimer();
  messageEl.textContent = '🎉 You win!';
  resetFaceBtn.textContent = '😎';

  for (const row of state.board) {
    for (const cell of row) {
      if (cell.mine) {
        cell.flagged = true;
      }
    }
  }
}

function checkWin() {
  const hidden = state.board.flat().filter((cell) => !cell.revealed).length;
  if (!state.gameOver && hidden === state.mines) {
    handleWin();
  }
}

function revealCell(row, col) {
  const cell = state.board[row][col];
  if (state.gameOver || cell.revealed || cell.flagged) {
    return;
  }

  if (state.firstMove) {
    placeMines(row, col);
    state.firstMove = false;
    startTimer();
  }

  if (cell.mine) {
    handleLoss(row, col);
    render();
    return;
  }

  floodReveal(row, col);
  checkWin();
  render();
}

function chordCell(row, col) {
  const cell = state.board[row][col];
  if (!cell.revealed || cell.count === 0 || state.gameOver) {
    return;
  }

  const n = neighbors(row, col, state.rows, state.cols);
  const flagCount = n.filter(([r, c]) => state.board[r][c].flagged).length;
  if (flagCount !== cell.count) {
    return;
  }

  for (const [r, c] of n) {
    if (!state.board[r][c].flagged) {
      revealCell(r, c);
    }
  }
}

function toggleFlag(row, col) {
  const cell = state.board[row][col];
  if (state.gameOver || cell.revealed) {
    return;
  }

  if (!cell.flagged && remainingMines() <= 0) {
    return;
  }

  cell.flagged = !cell.flagged;
  if (state.firstMove && cell.flagged) {
    startTimer();
    state.firstMove = false;
    placeMines(row, col);
  }
  checkWin();
  render();
}

function remainingMines() {
  const flagged = state.board.flat().filter((cell) => cell.flagged).length;
  return state.mines - flagged;
}

function formatMinesLeft() {
  return String(Math.max(-99, remainingMines())).padStart(3, '0');
}

function render() {
  boardEl.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;
  boardEl.innerHTML = '';

  for (let row = 0; row < state.rows; row += 1) {
    for (let col = 0; col < state.cols; col += 1) {
      const data = state.board[row][col];
      const cellEl = document.createElement('button');
      cellEl.className = 'cell';
      cellEl.type = 'button';
      cellEl.setAttribute('aria-label', `cell ${row + 1},${col + 1}`);

      if (data.revealed) {
        cellEl.classList.add('revealed');
        if (data.mine) {
          cellEl.classList.add('mine');
          cellEl.textContent = data.exploded ? '💥' : '💣';
        } else if (data.count > 0) {
          cellEl.textContent = String(data.count);
          cellEl.classList.add(`n${data.count}`);
        }
      } else if (data.flagged) {
        cellEl.classList.add('flagged');
        cellEl.textContent = '🚩';
      }

      if (data.wrongFlag) {
        cellEl.classList.add('wrong-flag');
        cellEl.textContent = '✖';
      }

      cellEl.addEventListener('click', () => revealCell(row, col));
      cellEl.addEventListener('dblclick', () => chordCell(row, col));
      cellEl.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        toggleFlag(row, col);
      });

      boardEl.appendChild(cellEl);
    }
  }

  mineCountEl.textContent = formatMinesLeft();
  timerEl.textContent = String(state.elapsed).padStart(3, '0');
}

function clampSettings(rows, cols, mines) {
  const clampedRows = Math.max(6, Math.min(24, Number(rows) || 9));
  const clampedCols = Math.max(6, Math.min(30, Number(cols) || 9));
  const maxMines = clampedRows * clampedCols - 9;
  const clampedMines = Math.max(5, Math.min(maxMines, Number(mines) || 10));
  return { rows: clampedRows, cols: clampedCols, mines: clampedMines };
}

function setActivePreset(level) {
  for (const btn of presetButtons) {
    btn.classList.toggle('active', btn.dataset.level === level);
  }
}

function newGame(level = 'custom') {
  stopTimer();

  const settings = level === 'custom'
    ? clampSettings(rowsInput.value, colsInput.value, minesInput.value)
    : PRESETS[level];

  rowsInput.value = String(settings.rows);
  colsInput.value = String(settings.cols);
  minesInput.value = String(settings.mines);

  state = createState(settings.rows, settings.cols, settings.mines);
  state.level = level;
  messageEl.textContent = 'Left-click to reveal, right-click to flag, double-click number to chord.';
  resetFaceBtn.textContent = '🙂';
  setActivePreset(level);
  render();
}

newGameBtn.addEventListener('click', () => newGame('custom'));
resetFaceBtn.addEventListener('click', () => newGame(state.level));

for (const button of presetButtons) {
  button.addEventListener('click', () => {
    const { level } = button.dataset;
    if (level === 'custom') {
      newGame('custom');
      return;
    }
    newGame(level);
  });
}

newGame('beginner');
