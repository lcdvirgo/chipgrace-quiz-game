const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static('public'));

// Game state (moved outside handler to persist between function calls)
let gameState = {
    phase: 'waiting',
    currentQuestion: 0,
    players: {},
    isStarted: false,
    answeredCount: 0
};

exports.handler = async (event, context) => {
    // Handle CORS
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        };
    }

    // Initialize Socket.IO
    const io = new Server({
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Socket connection handling
    io.on('connection', (socket) => {
        console.log('User connected:', socket.id);

        // Debug logging for all events
        socket.onAny((eventName, ...args) => {
            console.log(`Event received: ${eventName}`, args);
        });

        // Handle player joining
        socket.on('joinGame', (data) => {
            const { name, isHost } = data;
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

        // Rest of your socket event handlers...
    });

    // Return response for Netlify Function
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ message: 'Socket server running' })
    };
};

// Add better connection handling
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
    document.getElementById('connection-status').textContent = 'Connected';
    document.getElementById('connection-status').style.color = 'green';
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    document.getElementById('connection-status').textContent = 'Connection Error';
    document.getElementById('connection-status').style.color = 'red';
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    document.getElementById('connection-status').textContent = 'Disconnected';
    document.getElementById('connection-status').style.color = 'orange';
});

// Add reconnection handling
socket.on('reconnect_attempt', () => {
    console.log('Attempting to reconnect...');
});

socket.on('reconnect', () => {
    console.log('Reconnected successfully');
});

// Socket connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Debug logging for all events
    socket.onAny((eventName, ...args) => {
        console.log(`Event received: ${eventName}`, args);
    });

    // Handle player joining
    socket.on('joinGame', (data) => {
        const { name, isHost } = data;
        console.log(`Player ${name} joining game (Host: ${isHost})`);
        
        // Add player to game state
        gameState.players[socket.id] = {
            name: name,
            score: 0,
            isHost: isHost,
            currentAnswer: null,
            joinedAt: Date.now()
        };
        
        // Notify client they've joined
        socket.emit('joined', {
            playerId: socket.id,
            isHost: isHost
        });
        
        // Update all clients with new player list
        io.emit('updatePlayers', Object.values(gameState.players));
    });

    // Handle game start
    socket.on('startGame', () => {
        console.log('Start game request received from:', socket.id);
        const player = gameState.players[socket.id];

        if (player && player.isHost) {
            console.log('Host is starting the game');
            gameState.isStarted = true;
            gameState.currentQuestion = 0;
            gameState.phase = 'question';
            gameState.answeredCount = 0;

            // Reset all player scores
            Object.values(gameState.players).forEach(p => {
                p.score = 0;
                p.currentAnswer = null;
            });

            // Broadcast game start to all clients
            io.emit('gameStarted', 0);
            console.log('Game started, first question sent');
        } else {
            console.log('Non-host tried to start game');
            socket.emit('error', { message: 'Only host can start the game' });
        }
    });

    // Handle answer submission
    socket.on('submitAnswer', (data) => {
        if (!gameState.isStarted) return;
    
        const player = gameState.players[socket.id];
        if (player && player.currentAnswer === null) {
            player.currentAnswer = data.answer;
            
            // Calculate score with time bonus
            if (data.answer === data.correctAnswer) {
                const timeBonus = Math.floor((data.timeLeft / 20) * 1000);
                player.score += 1000 + timeBonus;
            }
    
            gameState.answeredCount++;
            
            // Check if all players answered or time's up
            const totalPlayers = Object.keys(gameState.players).length;
            if (gameState.answeredCount === totalPlayers || data.timeLeft <= 0) {
                // Send results to all players
                io.emit('showResults', {
                    players: Object.values(gameState.players),
                    correctAnswer: data.correctAnswer
                });
                
                // After 5 seconds, show leaderboard
                setTimeout(() => {
                    io.emit('showLeaderboard', Object.values(gameState.players));
                }, 5000);
            }
        }
    });

    // Handle next question request
    socket.on('nextQuestion', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost) {
            gameState.currentQuestion++;
            gameState.answeredCount = 0;
            gameState.phase = 'question';
            
            // Reset player answers
            Object.values(gameState.players).forEach(p => {
                p.currentAnswer = null;
            });
            
            io.emit('showQuestion', gameState.currentQuestion);
            console.log('Moving to next question:', gameState.currentQuestion);
        }
    });

    // Handle game reset
    socket.on('resetGame', () => {
        const player = gameState.players[socket.id];
        if (player && player.isHost) {
            gameState = {
                phase: 'waiting',
                currentQuestion: 0,
                players: {},
                isStarted: false,
                answeredCount: 0
            };
            io.emit('gameReset');
            console.log('Game reset by host');
        }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
        const player = gameState.players[socket.id];
        if (player) {
            console.log(`Player ${player.name} disconnected`);
            delete gameState.players[socket.id];
            
            // Update remaining players
            io.emit('updatePlayers', Object.values(gameState.players));
            
            // If host disconnects, end game
            if (player.isHost) {
                gameState.isStarted = false;
                io.emit('hostLeft');
                console.log('Host left, game ended');
            }
        }
    });

    // Handle error
    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

// Error handling for the server
server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});