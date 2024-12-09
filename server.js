// server.js
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
    cors: {
        origin: ["https://chipgrace-quiz-game.netlify.app", "http://localhost:3000"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true
    }
});

// Game configuration
const QUESTION_TIME = 30000; // 30 seconds
const REVEAL_TIME = 5000; // 5 seconds for showing results

// Game state
let gameState = {
    phase: 'waiting',
    currentQuestion: 0,
    players: {},
    isStarted: false,
    answeredCount: 0,
    questions: [], // Array to store quiz questions
    timer: null
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
        
        socket.emit('gameJoined', {
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

            // Reset all players' scores
            Object.values(gameState.players).forEach(p => {
                p.score = 0;
                p.currentAnswer = null;
            });

            startQuestion();
        }
    });

    // Handle answer submission
    socket.on('submitAnswer', (data) => {
        if (!gameState.isStarted || gameState.phase !== 'question') return;

        const player = gameState.players[socket.id];
        if (player && player.currentAnswer === null) {
            player.currentAnswer = data.answer;
            
            if (data.answer === data.correctAnswer) {
                const timeBonus = Math.floor((data.timeLeft / QUESTION_TIME) * 1000);
                player.score += 1000 + timeBonus;
            }

            gameState.answeredCount++;
            
            const totalPlayers = Object.keys(gameState.players).length;
            if (gameState.answeredCount === totalPlayers) {
                showResults();
            }
        }
    });

    // Handle next question request
    socket.on('nextQuestion', () => {
        const player = gameState.players[socket.id];
        if (player?.isHost) {
            gameState.currentQuestion++;
            
            if (gameState.currentQuestion >= gameState.questions.length) {
                endGame();
            } else {
                startQuestion();
            }
        }
    });

    // Handle show leaderboard request
    socket.on('showLeaderboard', () => {
        const player = gameState.players[socket.id];
        if (player?.isHost) {
            showLeaderboard();
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
                endGame();
            }
        }
    });
});

// Helper functions
function startQuestion() {
    gameState.phase = 'question';
    gameState.answeredCount = 0;
    
    Object.values(gameState.players).forEach(p => {
        p.currentAnswer = null;
    });
    
    io.emit('showQuestion', {
        questionNumber: gameState.currentQuestion + 1,
        questionData: gameState.questions[gameState.currentQuestion],
        totalTime: QUESTION_TIME
    });

    // Set timer to automatically show results after question time
    if (gameState.timer) clearTimeout(gameState.timer);
    gameState.timer = setTimeout(() => {
        if (gameState.phase === 'question') {
            showResults();
        }
    }, QUESTION_TIME);
}

function showResults() {
    gameState.phase = 'results';
    if (gameState.timer) clearTimeout(gameState.timer);

    const currentQuestion = gameState.questions[gameState.currentQuestion];
    io.emit('showResults', {
        players: Object.values(gameState.players),
        correctAnswer: currentQuestion.correctAnswer
    });
}

function showLeaderboard() {
    gameState.phase = 'leaderboard';
    const sortedPlayers = Object.values(gameState.players)
        .sort((a, b) => b.score - a.score);
    
    io.emit('showLeaderboard', {
        players: sortedPlayers,
        isLastQuestion: gameState.currentQuestion === gameState.questions.length - 1
    });
}

function endGame() {
    gameState.phase = 'finished';
    gameState.isStarted = false;
    
    const winners = Object.values(gameState.players)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    
    io.emit('gameOver', { winners });
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});