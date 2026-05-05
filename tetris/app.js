// --- 1. CONFIGURACIÓN WEBSOCKET (Módulo de Hardware) ---
const ESP32_IP = '172.22.3.214'; // IP de la ESP
const socket = new WebSocket(`ws://${ESP32_IP}:81`);

socket.onopen = () => console.log("[Conexión] ¡Enlazado con la ESP32!");

// Variables para manejar el movimiento continuo
let leftInterval;
let rightInterval;
let pin3Held = false; // variable para saber si hicimos un Hard Drop

socket.onmessage = (event) => {
    let msg = event.data;
    console.log(`[Comando ESP32]: ${msg}`);

    // --- PIN 1 (D13): Izquierda ---
    if (msg === "PIN1_TOUCH") {
        moveLeft(); drawBoard(); 
    }
    if (msg === "PIN1_HOLD") {
        leftInterval = setInterval(() => { moveLeft(); drawBoard(); }, 100);
    }
    if (msg === "PIN1_RELEASE") clearInterval(leftInterval);

    // --- PIN 2 (D4): Derecha ---
    if (msg === "PIN2_TOUCH") {
        moveRight(); drawBoard();
    }
    if (msg === "PIN2_HOLD") {
        rightInterval = setInterval(() => { moveRight(); drawBoard(); }, 100);
    }
    if (msg === "PIN2_RELEASE") clearInterval(rightInterval);

    // --- PIN 3 (D32): Acción (CORREGIDO) ---
    if (msg === "PIN3_TOUCH") {
        // Al tocar, asumimos que es un toque rápido hasta que se demuestre lo contrario
        pin3Held = false; 
    }
    if (msg === "PIN3_HOLD") {
        pin3Held = true; // Marcamos que el usuario mantuvo presionado
        hardDrop();
        drawBoard();
    }
    if (msg === "PIN3_RELEASE") {
        // Solo rotamos si soltó el dedo RÁPIDO (es decir, no fue un hold)
        if (!pin3Held) {
            rotatePiece();
            drawBoard();
        }
    }
};

socket.onerror = () => console.error("[Error] Revisa la IP.");

// --- 2. CONFIGURACIÓN DEL CANVAS Y MATRIZ (Motor Gráfico) ---
const canvas = document.getElementById('tetris');
const ctx = canvas.getContext('2d');

let score = 0;
const ROWS = 20;
const COLS = 10;
const BLOCK_SIZE = 30; // 30 píxeles por bloque

// Paleta de colores de Tetris
const COLORS = [
    '#000000', // 0: Vacío (no se dibuja)
    '#00FFFF', // 1: I (Cian)
    '#0000FF', // 2: J (Azul)
    '#FFA500', // 3: L (Naranja)
    '#FFFF00', // 4: O (Amarillo)
    '#00FF00', // 5: S (Verde)
    '#800080', // 6: T (Morado)
    '#FF0000'  // 7: Z (Rojo)
];

// Creamos el tablero: un arreglo de 20 filas, cada una con 10 ceros
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));



// --- 3. DEFINICIÓN DE PIEZAS ---
// El índice del arreglo corresponde al índice de color en COLORS
const PIECES = [
    [], // Índice 0 vacío por seguridad
    [   // 1: I (Cian) - Matriz 4x4
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
    ],
    [   // 2: J (Azul) - Matriz 3x3
        [2, 0, 0],
        [2, 2, 2],
        [0, 0, 0]
    ],
    [   // 3: L (Naranja) - Matriz 3x3
        [0, 0, 3],
        [3, 3, 3],
        [0, 0, 0]
    ],
    [   // 4: O (Amarillo) - Matriz 2x2
        [4, 4],
        [4, 4]
    ],
    [   // 5: S (Verde) - Matriz 3x3
        [0, 5, 5],
        [5, 5, 0],
        [0, 0, 0]
    ],
    [   // 6: T (Morado) - Matriz 3x3
        [0, 6, 0],
        [6, 6, 6],
        [0, 0, 0]
    ],
    [   // 7: Z (Rojo) - Matriz 3x3
        [7, 7, 0],
        [0, 7, 7],
        [0, 0, 0]
    ]
];

// Estado inicial de la pieza (vacío por ahora)
let activePiece = {
    shape: [],
    colorIndex: 0,
    x: 0,
    y: 0
};

// Generar una pieza aleatoria
function randomPiece() {
    let r = Math.floor(Math.random() * 7) + 1; 
    activePiece.shape = PIECES[r];
    activePiece.colorIndex = r;
    activePiece.x = 3;
    activePiece.y = 0;
    
    // GAME OVER
    if (collide(0, 0)) {
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(0)); // Reinicia tablero
        score = 0; // Reinicia la variable de puntos
        document.getElementById('score').innerText = `Puntuación: ${score}`; // Actualiza el texto en pantalla
        console.log("¡GAME OVER! Reiniciando...");
    }
}

randomPiece();

// --- 4. FUNCIONES DE RENDERIZADO ACTUALIZADAS ---

function drawBlock(x, y, colorIndex) {
    if (colorIndex === 0) return; 
    
    ctx.fillStyle = COLORS[colorIndex];
    ctx.fillRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
}

// Nueva función exclusiva para dibujar la pieza que está en movimiento
function drawActivePiece() {
    for (let r = 0; r < activePiece.shape.length; r++) {
        for (let c = 0; c < activePiece.shape[r].length; c++) {
            // Si hay un bloque en la matriz de la pieza, lo dibujamos
            if (activePiece.shape[r][c] !== 0) {
                // Sumamos la posición de la pieza (x, y) a la posición interna de su matriz (c, r)
                drawBlock(activePiece.x + c, activePiece.y + r, activePiece.colorIndex);
            }
        }
    }
}

function drawBoard() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Dibujar los bloques fijos del fondo
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            drawBlock(c, r, board[r][c]);
        }
    }
    
    // 2. Dibujar la pieza activa encima
    drawActivePiece();
}

// --- 5. LÓGICA FÍSICA Y COLISIONES ---

// Función para verificar si un movimiento es válido
function collide(offsetX, offsetY, pieceShape = activePiece.shape) {
    for (let r = 0; r < pieceShape.length; r++) {
        for (let c = 0; c < pieceShape[r].length; c++) {
            // Solo revisamos los cuadros que forman parte de la pieza (números distintos a 0)
            if (pieceShape[r][c] !== 0) {
                let newX = activePiece.x + c + offsetX;
                let newY = activePiece.y + r + offsetY;

                // 1. ¿Choca con las paredes izquierda o derecha?
                if (newX < 0 || newX >= COLS) return true;
                
                // 2. ¿Choca con el piso?
                if (newY >= ROWS) return true;
                
                // 3. ¿Choca con otra pieza ya congelada en el tablero?
                // (Ignoramos si newY < 0 porque la pieza apenas está entrando por arriba)
                if (newY >= 0 && board[newY][newX] !== 0) return true;
            }
        }
    }
    return false; // Si no chocó con nada, el movimiento es válido
}

function clearLines() {
    let linesCleared = 0;
    
    // Recorremos el tablero de abajo hacia arriba
    for (let r = ROWS - 1; r >= 0; r--) {
        let isRowFull = true;
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === 0) {
                isRowFull = false;
                break;
            }
        }
        
        if (isRowFull) {
            // Cortamos la fila llena (la eliminamos)
            board.splice(r, 1);
            // Insertamos una fila completamente nueva llena de ceros en la posición 0 (arriba)
            board.unshift(Array(COLS).fill(0));
            
            linesCleared++;
            // Como las filas bajaron un índice, volvemos a revisar la misma posición 'r'
            r++; 
        }
    }
    
    // Sistema de puntuación clásico
    if (linesCleared > 0) {
        if (linesCleared === 1) score += 100;
        else if (linesCleared === 2) score += 300;
        else if (linesCleared === 3) score += 500;
        else if (linesCleared === 4) score += 800; // Tetris
        
        document.getElementById('score').innerText = `Puntuación: ${score}`;
        
        console.log("¡Línea limpiada! Puntos: " + score);
        
        // --- NUEVO: Avisarle a la ESP32 ---
        // Verificamos que la conexión esté abierta antes de enviar
        if (socket.readyState === WebSocket.OPEN) {
            socket.send("SCORE"); 
        }
    }
}

// Congelar la pieza en el tablero (ACTUALIZADA)
function lockPiece() {
    for (let r = 0; r < activePiece.shape.length; r++) {
        for (let c = 0; c < activePiece.shape[r].length; c++) {
            if (activePiece.shape[r][c] !== 0) {
                board[activePiece.y + r][activePiece.x + c] = activePiece.colorIndex;
            }
        }
    }
    
    clearLines(); // Revisamos si hay líneas para borrar y sumar puntos
    randomPiece(); // Generamos la nueva pieza
}

// Intentar mover la pieza hacia abajo
function moveDown() {
    // Si NO hay colisión al sumar 1 a 'Y'
    if (!collide(0, 1)) {
        activePiece.y++;
    } else {
        // Si hay colisión, la pieza tocó fondo o chocó con otra
        lockPiece();
    }
}

// --- FUNCIONES DE CONTROL ---

function moveLeft() {
    if (!collide(-1, 0)) {
        activePiece.x--;
    }
}

function moveRight() {
    if (!collide(1, 0)) {
        activePiece.x++;
    }
}

function rotatePiece() {
    const originalShape = activePiece.shape;
    let newShape = [];
    
    // Algoritmo para rotar matriz 90 grados a la derecha
    for (let c = 0; c < originalShape[0].length; c++) {
        let newRow = [];
        for (let r = originalShape.length - 1; r >= 0; r--) {
            newRow.push(originalShape[r][c]);
        }
        newShape.push(newRow);
    }
    
    // Validar que la rotación no haga que la pieza atraviese la pared u otro bloque
    if (!collide(0, 0, newShape)) {
        activePiece.shape = newShape;
    }
}

// Drop manual (para cuando mantengas presionado el pin de giro)
function hardDrop() {
    while (!collide(0, 1)) {
        activePiece.y++;
    }
    lockPiece();
    dropCounter = 0; // Reinicia el contador de gravedad
}

// --- PRUEBA CON TECLADO (TEMPORAL) ---
// Para que puedas probar la lógica en tu PC antes de conectar la ESP32
document.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') moveLeft();
    if (event.key === 'ArrowRight') moveRight();
    if (event.key === 'ArrowUp') rotatePiece();
    if (event.key === ' ') hardDrop(); // Barra espaciadora para Hard Drop
    drawBoard(); // Forzamos el dibujado para que se vea instantáneo
});

// --- 6. GAME LOOP (MOTOR DEL JUEGO) ---
let dropCounter = 0;
let lastTime = 0;
const DROP_INTERVAL = 1000; // La pieza caerá 1 bloque cada 1000 milisegundos (1 segundo)

function update(time = 0) {
    // Calculamos cuánto tiempo pasó desde el último fotograma
    const deltaTime = time - lastTime;
    lastTime = time;
    dropCounter += deltaTime;

    // Si ya pasó un segundo, aplicamos gravedad
    if (dropCounter > DROP_INTERVAL) {
        moveDown();
        dropCounter = 0;
    }

    // Dibujamos todo el estado actual
    drawBoard();

    // Volvemos a pedirle al navegador que ejecute esta función en el siguiente fotograma
    requestAnimationFrame(update);
}

// Iniciar el motor del juego
update();