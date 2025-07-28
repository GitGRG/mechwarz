// index.js (Server-side with rooms)

const express = require('express');
const app     = express();
const http    = require('http').createServer(app);
const io      = require('socket.io')(http);

app.use(express.static('public'));

// ─── Room management ─────────────────────────
const games = {}; // roomId → game state

// expose a webpage listing all active rooms
app.get('/rooms', (req, res) => {
  let html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Active Rooms</title>
        <style>
          body { background: #0c0c0c; color: #eee; font-family: sans-serif; padding: 20px; }
          h1 { margin-bottom: 1em; }
          ul { list-style: none; padding: 0; }
          li { margin: 0.5em 0; }
          a { color: #4af; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>Active Rooms</h1>
        <ul>
  `;
  for (const [roomId, game] of Object.entries(games)) {
    html += `<li>
      <strong>${roomId}</strong> (${game.players.length}/4)
      ${game.players.length < 4
        ? `<a href="/?room=${encodeURIComponent(roomId)}">Join</a>`
        : `<em>Full</em>`}
    </li>\n`;
  }
  html += `
        </ul>
      </body>
    </html>
  `;
  res.send(html);
});

// Layout constants (must match client CSS)
const WIDTH            = 1050;
const HEIGHT           = 790;
const DOT_COUNT        = 13;
const DOT_SIZE         = 20;
const DOT_MARGIN       = 10;
const DOT_LEFT_OFFSET  = 10;
const DOT_RIGHT_OFFSET = WIDTH - DOT_SIZE - DOT_LEFT_OFFSET;
const HEX_COUNT        =10;
const SQUARE_COUNT     = 10;
const SQUARE_MARGIN    = 10;


// ─── Image‑column constants ───────────────────────
const IMAGE_COUNT        = 18;
const IMAGE_WIDTH        = 20;
const IMAGE_HEIGHT       = 34;
const IMAGE_MARGIN       = 10;
// place the image‑column just left of your right‑column:
const IMAGE_LEFT_OFFSET  = DOT_RIGHT_OFFSET - IMAGE_WIDTH - IMAGE_MARGIN;

const C_IMAGE_COUNT        = 9;    // ← adjust as needed
const C_IMAGE_WIDTH        = 20;   // ← adjust width
const C_IMAGE_HEIGHT       = 80;   // ← adjust height
const C_IMAGE_MARGIN       = 5;   // ← adjust spacing
const C_IMAGE_LEFT_OFFSET  = IMAGE_LEFT_OFFSET - C_IMAGE_WIDTH - C_IMAGE_MARGIN;

// CC‑images (row of 6, below top polygons)
const CC_IMAGE_COUNT   = 7;
const CC_IMAGE_WIDTH   = 80;  // rotated from 20×34
const CC_IMAGE_HEIGHT  = 20;
const CC_IMAGE_MARGIN  = 10;
// y‑position: DOT_MARGIN (20px) + DOT_SIZE (20px) + SQUARE_MARGIN (10px)
const CC_IMAGE_Y       = DOT_MARGIN + DOT_SIZE + SQUARE_MARGIN;





// Second CC‑row (7 images, below first CC row)
const CC2_IMAGE_COUNT  = 7;
const CC2_IMAGE_WIDTH  = CC_IMAGE_WIDTH;   // 34
const CC2_IMAGE_HEIGHT = CC_IMAGE_HEIGHT;  // 20
const CC2_IMAGE_MARGIN = CC_IMAGE_MARGIN;  // 10
// Y = first row Y + its height + margin
const CC2_IMAGE_Y      = CC_IMAGE_Y + CC_IMAGE_HEIGHT + CC_IMAGE_MARGIN;


// Third row: “cold” images (6×65×20)
const COLD_IMAGE_COUNT  = 6;
const COLD_IMAGE_WIDTH  = 65;
const COLD_IMAGE_HEIGHT = 20;
const COLD_IMAGE_MARGIN = 10;
// place below second CC row:
const COLD_IMAGE_Y      = CC2_IMAGE_Y + CC2_IMAGE_HEIGHT + COLD_IMAGE_MARGIN;

// Fourth row: “hot” images (6×65×20) below the cold row
const HOT_IMAGE_COUNT  = 6;
const HOT_IMAGE_WIDTH  = 65;
const HOT_IMAGE_HEIGHT = 20;
const HOT_IMAGE_MARGIN = 10;
// Y = cold row Y + its height + margin
const HOT_IMAGE_Y      = COLD_IMAGE_Y + COLD_IMAGE_HEIGHT + HOT_IMAGE_MARGIN;



const G_IMAGE_COUNT      = 15;
const G_IMAGE_WIDTH      = 40;
const G_IMAGE_HEIGHT     = 40;
const G_IMAGE_MARGIN     = IMAGE_MARGIN;
const G_IMAGE_LEFT_OFFSET = C_IMAGE_LEFT_OFFSET - G_IMAGE_WIDTH - G_IMAGE_MARGIN;
const CS_IMAGE_COUNT      = 9;
const CS_IMAGE_WIDTH      = 136;   // 1131px × 0.2 ≈ 226px
const CS_IMAGE_HEIGHT     = 70;   // 578px × 0.2 ≈ 116px
const CS_IMAGE_MARGIN     = IMAGE_MARGIN;
const CS_IMAGE_LEFT_OFFSET = DOT_LEFT_OFFSET;

// D‑images (row above bottom polygons)
const D_IMAGE_COUNT   = 12;
const D_IMAGE_WIDTH   = 20;
const D_IMAGE_HEIGHT  = 34;
const D_IMAGE_MARGIN  = IMAGE_MARGIN;

const R_IMAGE_COUNT        = 25;
const R_IMAGE_WIDTH        = 25;
const R_IMAGE_HEIGHT       = 25;
const R_IMAGE_MARGIN       = 5;
const R_IMAGE_LEFT_OFFSET  = G_IMAGE_LEFT_OFFSET - R_IMAGE_WIDTH - R_IMAGE_MARGIN;




// Shuffle helper
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Build main deck
function createMainDeck() {
  const d = [];
  for (let i = 1; i <= 63; i++) d.push(i.toString().padStart(2, '0'));
  return shuffle(d);
}

// Initialize dot positions (right column only)
function initDots() {
  const dots = [];
  const totalH = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_MARGIN;
  const startY = (HEIGHT - totalH) / 1 - 100;
  for (let i = 0; i < DOT_COUNT; i++) {
    dots.push({ x: DOT_RIGHT_OFFSET, y: startY + i * (DOT_SIZE + DOT_MARGIN) });
  }
  return dots;
}

// Initialize hexagon positions/values (right column only)
function initHexes() {
  const hexes = [];
  const totalH = DOT_COUNT * DOT_SIZE + (DOT_COUNT - 1) * DOT_MARGIN;
  const startY = (HEIGHT - totalH) / 1 - 135;
  for (let i = 0; i < HEX_COUNT; i++) {
    hexes.push({
      x: DOT_RIGHT_OFFSET,
      y: startY - i * (DOT_SIZE + DOT_MARGIN),
      value: 20
    });
  }
  return hexes;
}



// ─── initSquares(): always show max on load ─────────────────
function initSquares() {
  const shapes = [
    { clip: 'triangle', min: 1,  max: 4  },
    { clip: 'triangle', min: 1,  max: 4  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'square',   min: 1,  max: 6  },
    { clip: 'hexagon',  min: 1,  max: 8  },
    { clip: 'hexagon',  min: 1,  max: 8  },
    { clip: 'diamond',  min: 0,  max: 10  },
    { clip: 'diamond',  min: 0,  max: 10  },
    { clip: 'decagon',  min: 1,  max: 12 },
    { clip: 'decagon',  min: 1,  max: 12 }
  ];

  const count   = shapes.length;
  const totalW  = count * DOT_SIZE + (count - 1) * SQUARE_MARGIN;
  const startX  = (WIDTH - totalW) / 2;
  const topY    = DOT_MARGIN;
  const botY    = HEIGHT - DOT_MARGIN - DOT_SIZE;

  const makeRow = y => shapes.map((s, i) => {
    // use s.max instead of random
    const raw = s.max;
    const val = s.clip === 'diamond'
      ? String(raw).padStart(2, '0')
      : raw;
    return {
      x:     startX + i * (DOT_SIZE + SQUARE_MARGIN),
      y,
      value: val
    };
  });

  return [
    ...makeRow(topY),   // top row all max
    ...makeRow(botY)    // bottom row all max
  ];
}





// Initialize draggable‑image positions (left of the existing column)
function initImages() {
  const imgs = [];
  const totalH = IMAGE_COUNT * IMAGE_HEIGHT + (IMAGE_COUNT - 1) * IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < IMAGE_COUNT; i++) {
    imgs.push({
      x: IMAGE_LEFT_OFFSET,
      y: startY + i * (IMAGE_HEIGHT + IMAGE_MARGIN)
    });
  }
  return imgs;
}

// ─── After initImages(), define ─────────────────────────
function initCImages() {
  const cols = [];
  const totalH = C_IMAGE_COUNT * C_IMAGE_HEIGHT + (C_IMAGE_COUNT - 1) * C_IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < C_IMAGE_COUNT; i++) {
    cols.push({
      x: C_IMAGE_LEFT_OFFSET,
      y: startY + i * (C_IMAGE_HEIGHT + C_IMAGE_MARGIN)
    });
  }
  return cols;
}


function initCCImages() {
  const cols   = [];
  const totalW = CC_IMAGE_COUNT * CC_IMAGE_WIDTH
               + (CC_IMAGE_COUNT - 1) * CC_IMAGE_MARGIN;
  const startX = (WIDTH - totalW) / 2;
  for (let i = 0; i < CC_IMAGE_COUNT; i++) {
    cols.push({
      x: startX + i * (CC_IMAGE_WIDTH + CC_IMAGE_MARGIN),
      y: CC_IMAGE_Y
    });
  }
  return cols;
}



function initCC2Images() {
  const cols   = [];
  const totalW = CC2_IMAGE_COUNT * CC2_IMAGE_WIDTH
               + (CC2_IMAGE_COUNT - 1) * CC2_IMAGE_MARGIN;
  const startX = (WIDTH - totalW) / 2;
  for (let i = 0; i < CC2_IMAGE_COUNT; i++) {
    cols.push({
      x: startX + i * (CC2_IMAGE_WIDTH + CC2_IMAGE_MARGIN),
      y: CC2_IMAGE_Y
    });
  }
  return cols;
}


function initColdImages() {
  const cols   = [];
  const totalW = COLD_IMAGE_COUNT * COLD_IMAGE_WIDTH
               + (COLD_IMAGE_COUNT - 1) * COLD_IMAGE_MARGIN;
  const startX = (WIDTH - totalW) / 2;
  for (let i = 0; i < COLD_IMAGE_COUNT; i++) {
    cols.push({
      x: startX + i * (COLD_IMAGE_WIDTH + COLD_IMAGE_MARGIN),
      y: COLD_IMAGE_Y
    });
  }
  return cols;
}



function initHotImages() {
  const cols   = [];
  const totalW = HOT_IMAGE_COUNT * HOT_IMAGE_WIDTH
               + (HOT_IMAGE_COUNT - 1) * HOT_IMAGE_MARGIN;
  const startX = (WIDTH - totalW) / 2;
  for (let i = 0; i < HOT_IMAGE_COUNT; i++) {
    cols.push({
      x: startX + i * (HOT_IMAGE_WIDTH + HOT_IMAGE_MARGIN),
      y: HOT_IMAGE_Y
    });
  }
  return cols;
}




function initGImages() {
  const cols = [];
  const totalH = G_IMAGE_COUNT * G_IMAGE_HEIGHT + (G_IMAGE_COUNT - 1) * G_IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < G_IMAGE_COUNT; i++) {
    cols.push({
      x: G_IMAGE_LEFT_OFFSET,
      y: startY + i * (G_IMAGE_HEIGHT + G_IMAGE_MARGIN)
    });
  }
  return cols;
}

function initCSImages() {
  const cols = [];
  const totalH = CS_IMAGE_COUNT * CS_IMAGE_HEIGHT + (CS_IMAGE_COUNT - 1) * CS_IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < CS_IMAGE_COUNT; i++) {
    cols.push({
      x: CS_IMAGE_LEFT_OFFSET,
      y: startY + i * (CS_IMAGE_HEIGHT + CS_IMAGE_MARGIN)
    });
  }
  return cols;
}

function initDImages() {
  const cols = [];
  const totalW = D_IMAGE_COUNT * D_IMAGE_WIDTH
                 + (D_IMAGE_COUNT - 1) * D_IMAGE_MARGIN;
  const startX = (WIDTH - totalW) / 2;
  // compute bottom‐row y by re‑running initSquares()
  const squares = initSquares();
  // SQUARE_COUNT is how many per row
  const bottomY  = squares[squares.length - SQUARE_COUNT].y;
  const y        = bottomY - D_IMAGE_HEIGHT - D_IMAGE_MARGIN;
  for (let i = 0; i < D_IMAGE_COUNT; i++) {
    cols.push({
      x: startX + i * (D_IMAGE_WIDTH + D_IMAGE_MARGIN),
      y
    });
  }
  return cols;
}


function initRImages() {
  const cols = [];
  const totalH = R_IMAGE_COUNT * R_IMAGE_HEIGHT + (R_IMAGE_COUNT - 1) * R_IMAGE_MARGIN;
  const startY = (HEIGHT - totalH) / 2;
  for (let i = 0; i < R_IMAGE_COUNT; i++) {
    cols.push({
      x: R_IMAGE_LEFT_OFFSET,
      y: startY + i * (R_IMAGE_HEIGHT + R_IMAGE_MARGIN)
    });
  }
  return cols;
}



// ────────────────────────────────────────────────
io.on('connection', socket => {
  let room, game;

  function broadcastHandCounts() {
    if (!game) return;
    const counts = game.players.map(id => ({
      id,
      count: (game.hands[id] || []).length
    }));
    io.in(room).emit('hand-counts', counts);
  }

  // 1) Client joins a room
  socket.on('join-room', roomId => {
    room = roomId;
    if (!games[room]) {
      games[room] = {
        players: [],
        hands: {},
        table: [],
        deck: createMainDeck(),
        dotPositions: initDots(),
        hexPositions: initHexes(),
        squarePositions: initSquares(),
        imagePositions: initImages(),
        cImagePositions: initCImages(),
        gImagePositions: initGImages(),
        csImagePositions: initCSImages(),
        dImagePositions: initDImages(),
        rImagePositions: initRImages(),
        ccImagePositions: initCCImages(),
        cc2ImagePositions: initCC2Images(),
        coldImagePositions: initColdImages(),
        hotImagePositions:  initHotImages()

      };
    }
    game = games[room];

    if (game.players.length >= 4) {
      return socket.emit('room-full');
    }

    socket.join(room);
    game.players.push(socket.id);
    game.hands[socket.id] = [];

    // initial sync
    socket.emit('joined',       game.players.length);
    socket.emit('your-hand',    game.hands[socket.id]);
    socket.emit('table-update', game.table);
    socket.emit('dots-update',  game.dotPositions);
    socket.emit('hexes-update', game.hexPositions);
    socket.emit('squares-update', game.squarePositions);
    socket.emit('images-update', game.imagePositions);
    socket.emit('c-images-update', game.cImagePositions);
    socket.emit('g-images-update', game.gImagePositions);
    socket.emit('cs-images-update', game.csImagePositions);
    socket.emit('cc2-images-update', game.cc2ImagePositions);
    socket.emit('cc-images-update', game.ccImagePositions);
    socket.emit('cold-images-update', game.coldImagePositions);
    socket.emit('hot-images-update',  game.hotImagePositions);
    socket.emit('d-images-update', game.dImagePositions);
    broadcastHandCounts();
    socket.emit('r-images-update', game.rImagePositions);

  });

  // 2) Draw / shuffle main deck
  socket.on('draw-card', () => {
    if (!game || !game.deck.length) return;
    const c = game.deck.pop();
    game.hands[socket.id].push(c);
    socket.emit('your-hand', game.hands[socket.id]);
    broadcastHandCounts();
  });
  socket.on('shuffle-main-deck', () => {
    if (game) game.deck = shuffle(game.deck);
  });

  // 3) Play & move cards
  socket.on('play-card', ({ card, x, y }) => {
    if (!game) return;
    const idx = game.hands[socket.id].indexOf(card);
    if (idx !== -1) game.hands[socket.id].splice(idx, 1);
    game.table.push({ card, x, y });
    io.in(room).emit('table-update', game.table);
    socket.emit('your-hand', game.hands[socket.id]);
    broadcastHandCounts();
  });
  socket.on('move-table-card', ({ index, x, y }) => {
    if (!game || !game.table[index]) return;
    game.table[index].x = x;
    game.table[index].y = y;
    io.in(room).emit('table-update', game.table);
  });

  // 4) Return card from hand → deck
  socket.on('return-card-from-hand', ({ card }) => {
    if (!game) return;
    const h = game.hands[socket.id];
    const i = h.indexOf(card);
    if (i === -1) return;
    h.splice(i, 1);
    socket.emit('your-hand', h);
    broadcastHandCounts();
    game.deck.push(card);
    shuffle(game.deck);
  });

  // 5) Return card from table → deck
  socket.on('return-card-from-table', ({ index, card }) => {
    if (!game || !game.table[index] || game.table[index].card !== card) return;
    game.table.splice(index, 1);
    io.in(room).emit('table-update', game.table);
    broadcastHandCounts();
    game.deck.push(card);
    shuffle(game.deck);
  });

  // 6) Dot sync
  socket.on('move-dot', ({ index, x, y }) => {
    if (!game || !game.dotPositions[index]) return;
    game.dotPositions[index] = { x, y };
    io.in(room).emit('dots-update', game.dotPositions);
  });

  // 7) Hex sync
  socket.on('move-hex', ({ index, x, y }) => {
    if (!game || !game.hexPositions[index]) return;
    game.hexPositions[index].x = x;
    game.hexPositions[index].y = y;
    io.in(room).emit('hexes-update', game.hexPositions);
  });
  socket.on('update-hex', ({ index, value }) => {
    if (!game || !game.hexPositions[index]) return;
    game.hexPositions[index].value = value;
    io.in(room).emit('hexes-update', game.hexPositions);
  });

  // 8) Square sync
  socket.on('move-square', ({ index, x, y }) => {
    if (!game || !game.squarePositions[index]) return;
    game.squarePositions[index].x = x;
    game.squarePositions[index].y = y;
    io.in(room).emit('squares-update', game.squarePositions);
  });
  socket.on('update-square', ({ index, value }) => {
    if (!game || !game.squarePositions[index]) return;
    game.squarePositions[index].value = value;
    io.in(room).emit('squares-update', game.squarePositions);
  });

  // 9) Cleanup on disconnect
  socket.on('disconnect', () => {
    if (!game) return;
    game.players = game.players.filter(id => id !== socket.id);
    delete game.hands[socket.id];
    socket.leave(room);
    broadcastHandCounts();
    if (game.players.length === 0) delete games[room];
  });

  // 10) Image‑column sync
  socket.on('move-image', ({ index, x, y }) => {
    if (!game || !game.imagePositions[index]) return;
    game.imagePositions[index] = { x, y };
    io.in(room).emit('images-update', game.imagePositions);
  });

  socket.on('move-c-image', ({ index, x, y }) => {
    if (!game || !game.cImagePositions[index]) return;
    game.cImagePositions[index] = { x, y };
    io.in(room).emit('c-images-update', game.cImagePositions);
  });

  socket.on('move-g-image', ({ index, x, y }) => {
    if (!game || !game.gImagePositions[index]) return;
    game.gImagePositions[index] = { x, y };
    io.in(room).emit('g-images-update', game.gImagePositions);
  });

  socket.on('move-cs-image', ({ index, x, y }) => {
    if (!game || !game.csImagePositions[index]) return;
    game.csImagePositions[index] = { x, y };
    io.in(room).emit('cs-images-update', game.csImagePositions);
  });

  socket.on('move-d-image', ({ index, x, y }) => {
    if (!game || !game.dImagePositions[index]) return;
    game.dImagePositions[index] = { x, y };
    io.in(room).emit('d-images-update', game.dImagePositions);
  });

  socket.on('move-cc-image', ({ index, x, y }) => {
    if (!game || !game.ccImagePositions[index]) return;
    game.ccImagePositions[index] = { x, y };
    io.in(room).emit('cc-images-update', game.ccImagePositions);
  });



  socket.on('move-cc2-image', ({ index, x, y }) => {
    if (!game || !game.cc2ImagePositions[index]) return;
    game.cc2ImagePositions[index] = { x, y };
    io.in(room).emit('cc2-images-update', game.cc2ImagePositions);
  });

  // 13) “cold” images sync
  socket.on('move-cold-image', ({ index, x, y }) => {
    if (!game || !game.coldImagePositions[index]) return;
    game.coldImagePositions[index] = { x, y };
    io.in(room).emit('cold-images-update', game.coldImagePositions);
  });

  // 14) “hot” images sync
  socket.on('move-hot-image', ({ index, x, y }) => {
    if (!game || !game.hotImagePositions[index]) return;
    game.hotImagePositions[index] = { x, y };
    io.in(room).emit('hot-images-update', game.hotImagePositions);
  });




socket.on('move-r-image', ({ index, x, y }) => {
  if (!game || !game.rImagePositions[index]) return;
  game.rImagePositions[index] = { x, y };
  io.in(room).emit('r-images-update', game.rImagePositions);
});
  });

http.listen(3000, () => console.log('Server listening on port 3000'));
