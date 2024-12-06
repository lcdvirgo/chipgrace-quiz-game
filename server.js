const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// Initialize Socket.IO with CORS
const io = new Server(server, {
    cors: {
        origin: ["https://chipgrace-quiz-game.netlify.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Basic route for health check
app.get('/', (req, res) => {
    res.send('Quiz server running');
});

// Game state
let gameState = {
    phase: 'waiting',
    currentQuestion: 0,
    players: {},
    isStarted: false,
    answeredCount: 0
};

// Only handle socket connections
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle player joining
    socket.on('joinGame', (data) => {
        const { name, isHost } = data;
        console.log(`Player ${name} joining game`);
        
        gameState.players[socket.id] = {
            name: name,
            score: 0,
            isHost: isHost,
            currentAnswer: null
        };
        
        socket.emit('joined', { playerId: socket.id, isHost: isHost });
        io.emit('updatePlayers', Object.values(gameState.players));
    });

    // Handle start game
    socket.on('startGame', () => {
        if (gameState.players[socket.id]?.isHost) {
            gameState.isStarted = true;
            gameState.currentQuestion = 0;
            io.emit('gameStarted', 0);
        }
    });