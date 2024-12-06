const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

// Initialize Socket.IO with CORS settings
const io = new Server(server, {
    cors: {
        origin: ["https://chipgrace-quiz-game.netlify.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Basic route for health check
app.get('/', (req, res) => {
    res.send('Server is running');
});

// Game state
let gameState = {
    phase: 'waiting',
    currentQuestion: 0,
    players: {},
    isStarted: false,
    answeredCount: 0
};

// Socket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle player joining
    socket.on('joinGame', (data) => {
        const { name, isHost } = data;
        console.log(`Player ${name} joining game (Host: ${isHost})`);
        
        gameState.players[socket.id] = {
            name: name,
            score: 0,
            isHost: isHost,
            currentAnswer: null,
            joinedAt: Date.now()
        };
        
        socket.emit('joined', {
            playerId: socket.id,
            isHost: isHost
        });
        
        io.emit('updatePlayers', Object.values(gameState.players));
    });

    // Handle game start
    socket.on('startGame', () => {
        const player = gameState.players[socket.id];
        if (player?.isHost) {
            gameState.isStarted = true;
            gameState.currentQuestion = 0;
            gameState.phase = 'question';
            gameState.answeredCount = 0;

            Object.values(gameState.players).forEach(p => {
                p.score = 0;
                p.currentAnswer = null;
            });

            io.emit('gameStarted', 0);
            console.log('Game started by host');
        }
    });

    // Handle answer submission
    socket.on('submitAnswer', (data) => {
        if (!gameState.isStarted) return;

        const player = gameState.players[socket.id];
        if (player && player.currentAnswer === null) {
            player.currentAnswer = data.answer;
            
            if (data.answer === data.correctAnswer) {
                const timeBonus = Math.floor((data.timeLeft / 20) * 1000);
                player.score += 1000 + timeBonus;
            }

            gameState.answeredCount++;
            
            const totalPlayers = Object.keys(gameState.players).length;
            if (gameState.answeredCount === totalPlayers || data.timeLeft <= 0) {
                io.emit('showResults', {
                    players: Object.values(gameState.players),
                    correctAnswer: data.correctAnswer
                });
                
                setTimeout(() => {
                    io.emit('showLeaderboard', Object.values(gameState.players));
                }, 5000);
            }
        }
    });

    // Handle next question
    socket.on('nextQuestion', () => {
        const player = gameState.players[socket.id];
        if (player?.isHost) {
            gameState.currentQuestion++;
            gameState.answeredCount = 0;
            gameState.phase = 'question';
            
            Object.values(gameState.players).forEach(p => {
                p.currentAnswer = null;
            });
            
            io.emit('showQuestion', gameState.currentQuestion);
            console.log('Moving to next question:', gameState.currentQuestion);
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const player = gameState.players[socket.id];
        if (player) {
            console.log(`Player ${player.name} disconnected`);
            delete gameState.players[socket.id];
            
            io.emit('updatePlayers', Object.values(gameState.players));
            
            if (player.isHost) {
                gameState.isStarted = false;
                io.emit('hostLeft');
                console.log('Host left, game ended');
            }
        }
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});