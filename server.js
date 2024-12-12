// server.js
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");

const io = new Server(server, {
    cors: {
        origin: ["https://chipgrace-quiz-game.netlify.app", "http://localhost:3000"],
        methods: ["GET", "POST"],
        credentials: true,
        allowedHeaders: ["Access-Control-Allow-Origin"]
    }
});

// Game configuration
const QUESTION_TIME = 30000; // 30 seconds
const REVEAL_TIME = 5000; // 5 seconds for showing results

// Quiz questions
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
        correct: 1
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

// Game state with added timerStart field
let gameState = {
    phase: 'waiting',
    currentQuestion: 0,
    players: {},
    isStarted: false,
    answeredCount: 0,
    questions: [...quizQuestions],
    timer: null,
    timerStart: null // Track when the timer started
};

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Previous event handlers remain the same until startQuestion
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

    socket.on('startGame', () => {
        console.log('Received startGame event from client');
        const player = gameState.players[socket.id];
        if (player?.isHost) {
            console.log('Starting game as host');
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
        } else {
            console.log('Non-host tried to start game');
        }
    });

    socket.on('submitAnswer', (data) => {
        if (!gameState.isStarted || gameState.phase !== 'question') return;
    
        const player = gameState.players[socket.id];
        const currentQuestion = gameState.questions[gameState.currentQuestion];
        const correctAnswer = currentQuestion.answers[currentQuestion.correct];
        
        if (player && player.currentAnswer === null) {
            player.currentAnswer = data.answer;
            
            if (data.answer === correctAnswer) {
                // Calculate time bonus based on server-side timer
                const timeElapsed = Date.now() - gameState.timerStart;
                const timeLeft = Math.max(0, QUESTION_TIME - timeElapsed);
                const timeBonus = Math.floor((timeLeft / QUESTION_TIME) * 1000);
                player.score += 1000 + timeBonus;
            }
    
            gameState.answeredCount++;
            
            io.emit('playerAnswered', {
                playerCount: gameState.answeredCount,
                totalPlayers: Object.keys(gameState.players).length
            });
            
            if (gameState.answeredCount === Object.keys(gameState.players).length) {
                if (gameState.timer) {
                    clearTimeout(gameState.timer);
                    gameState.timer = null;
                }
                showResults();
            }
        }
    });

    socket.on('requestLeaderboard', () => {
        // Sort players by score and send back to client
        const sortedPlayers = Object.values(gameState.players)
            .sort((a, b) => b.score - a.score)
            .map(player => ({
                name: player.name,
                score: player.score
            }));
    
        socket.emit('leaderboardData', { 
            players: sortedPlayers,
            isLastQuestion: gameState.currentQuestion === gameState.questions.length - 1 
        });
    });

    // Other event handlers remain the same
    socket.on('nextQuestion', () => {
        const player = gameState.players[socket.id];
        console.log('Received nextQuestion event:', {
            socketId: socket.id,
            player: player,
            currentQuestion: gameState.currentQuestion,
            totalQuestions: gameState.questions.length,
            gameState: {
                phase: gameState.phase,
                isStarted: gameState.isStarted,
                answeredCount: gameState.answeredCount
            }
        });
    
        if (!player) {
            console.error('Player not found for socket ID:', socket.id);
            return;
        }
    
        if (!player.isHost) {
            console.error('Non-host tried to request next question:', {
                playerName: player.name,
                isHost: player.isHost
            });
            return;
        }
    
        console.log('Host requesting next question');
        gameState.currentQuestion++;
        
        if (gameState.currentQuestion >= gameState.questions.length) {
            console.log('No more questions, ending game');
            endGame();
        } else {
            console.log('Starting next question:', {
                questionNumber: gameState.currentQuestion,
                question: gameState.questions[gameState.currentQuestion]
            });
            
            // Reset game state for new question
            gameState.phase = 'question';
            gameState.answeredCount = 0;
            
            try {
                // Start new question immediately
                startQuestion();
            } catch (error) {
                console.error('Error starting next question:', error);
                // Reset game state on error
                gameState.currentQuestion--;
                gameState.phase = 'results';
            }
        }
    });

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

function startQuestion() {
    console.log('Starting question execution:', {
        questionNumber: gameState.currentQuestion,
        phase: gameState.phase,
        totalPlayers: Object.keys(gameState.players).length
    });
    
    try {
        gameState.phase = 'question';
        gameState.answeredCount = 0;
        gameState.allAnswered = false;
        gameState.timerStart = Date.now();
        
        // Reset all players' current answers
        Object.values(gameState.players).forEach(p => {
            p.currentAnswer = null;
        });

        const currentQuestion = gameState.questions[gameState.currentQuestion];
        
        if (!currentQuestion) {
            throw new Error('Question not found at index: ' + gameState.currentQuestion);
        }

        const questionData = {
            questionNumber: gameState.currentQuestion + 1,
            questionData: {
                question: currentQuestion.question,
                options: currentQuestion.answers,
                correctAnswer: currentQuestion.answers[currentQuestion.correct]
            },
            totalTime: QUESTION_TIME
        };
        
        console.log('Emitting new question to all clients:', questionData);
        io.emit('showQuestion', questionData);

        // Clear any existing timer
        if (gameState.timer) {
            clearTimeout(gameState.timer);
        }
        
        // Set timer for showing results
        gameState.timer = setTimeout(() => {
            if (gameState.phase === 'question') {
                console.log('Timer expired, handling unanswered players');
                Object.entries(gameState.players).forEach(([socketId, player]) => {
                    if (player.currentAnswer === null) {
                        player.currentAnswer = null;
                        gameState.answeredCount++;
                    }
                });
                showResults();
            }
        }, QUESTION_TIME);
        
        console.log('Question start completed successfully');
    } catch (error) {
        console.error('Error in startQuestion:', error);
        throw error;
    }
}

function showResults() {
    // Only proceed if we're still in question phase
    if (gameState.phase !== 'question') return;
    
    console.log('Entering showResults function'); // Add logging
    gameState.phase = 'results';
    const currentQuestion = gameState.questions[gameState.currentQuestion];

    // Clear any existing timer
    if (gameState.timer) {
        clearTimeout(gameState.timer);
        gameState.timer = null;
    }

    // Add more detailed result data
    const resultData = {
        players: Object.values(gameState.players),
        correctAnswer: currentQuestion.answers[currentQuestion.correct],
        question: currentQuestion.question,
        options: currentQuestion.answers,
        stats: {
            totalPlayers: Object.keys(gameState.players).length,
            correctAnswers: Object.values(gameState.players).filter(p => 
                p.currentAnswer === currentQuestion.answers[currentQuestion.correct]).length
        }
    };

    console.log('Emitting showResults with data:', resultData); // Add logging
    io.emit('showResults', resultData);
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