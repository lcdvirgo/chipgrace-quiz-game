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

const quizQuestions = [
    {
        question: "What colour was Chip and Grace's outfit on their first date?",
        answers: ["Linen beige", "White", "Sage green"],
        correct: 2
    },
    {
        question: "Chip and Grace's favourite movie for 2024?",
        answers: ["The Red One", "Deadpool & Wolverine", "Inside Out 2"],
        correct: 1
    },
    {
        question: "Chip and Grace's shared dream vacation?",
        answers: ["South Korea", "Kyoto", "Switzerland", "All of the above"],
        correct: 1
    },
    {
        question: "Chip and Grace's favourite mutual hobby?",
        answers: ["A walk in the park", "Sing to our hearts' content! - Karaoke", "Eating"],
        correct: 0
    },
    {
        question: "How long did we see each other before officially dating?",
        answers: ["22 days", "32 days", "42 days"],
        correct: 2
    },
    {
        question: "What was Grace's first impression of Chip?",
        answers: ["Sweet", "Intense", "Kind"],
        correct: 1
    },
    {
        question: "What was Chip's first impression of Grace?",
        answers: ["Ice queen", "Shy", "Obedient"],
        correct: 2
    },
    {
        question: "Who is the messier one?",
        answers: ["Grace", "Chip", "Both as messy"],
        correct: 0
    },
    {
        question: "What is Grace's and Chip's favourite colour, respectively?",
        answers: ["Sage green, sage green", "Pink, sage green", "White, orange", "White, beige"],
        correct: 2
    },
    {
        question: "What is Chip's favourite food?",
        answers: ["Ayam penyat", "Nasi lemak", "Anything with chilli"],
        correct: 2
    },
    {
        question: "What's Grace's favourite comfort food?",
        answers: ["Anything spicy", "Itacho Sushi", "Sauerkraut fish soup", "Pietro Italiano (Italian!)"],
        correct: 1
    },
    {
        question: "What is Chip and Grace's pet name for each other?",
        answers: ["Honey", "Dear", "Darling", "Love"],
        correct: 3
    },
    {
        question: "Are Chip and Grace beach or mountain persons?",
        answers: ["Beach please", "Majestic mountain", "Neither, we're homebodies"],
        correct: 1
    },
    {
        question: "How many children do we want?",
        answers: ["Stop at one", "Sky's the limit!", "2", "3"],
        correct: 2
    }
];

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
    questions: quizQuestions, // Initialize with our questions
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
        const currentQuestion = gameState.questions[gameState.currentQuestion];
        
        if (player && player.currentAnswer === null) {
            player.currentAnswer = data.answer;
            
            if (data.answer === currentQuestion.correctAnswer) {
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
    
    const currentQuestion = gameState.questions[gameState.currentQuestion];
    
    io.emit('showQuestion', {
        questionNumber: gameState.currentQuestion + 1,
        questionData: {
            question: currentQuestion.question,
            options: currentQuestion.options
        },
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
        correctAnswer: currentQuestion.correctAnswer,
        question: currentQuestion.question
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