const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let players = [];
let gameState = {
    deck: [],
    pile: [],
    turn: 0,
    hands: {}, // playerID: { hand, faceUp, faceDown }
};

function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]; // 11=J, 14=A
    let deck = [];
    for (let s of suits) {
        for (let v of values) {
            deck.push({ suit: s, value: v });
        }
    }
    return deck.sort(() => Math.random() - 0.5);
}

function startGame() {
    gameState.deck = createDeck();
    players.forEach((id) => {
        gameState.hands[id] = {
            hand: gameState.deck.splice(0, 5),
            faceUp: gameState.deck.splice(0, 3),
            faceDown: gameState.deck.splice(0, 3)
        };
    });
    gameState.pile = [];
    gameState.turn = 0;
    io.emit('gameState', gameState);
}

io.on('connection', (socket) => {
    if (players.length < 2) {
        players.push(socket.id);
        console.log(`Player joined: ${socket.id}`);
    }

    if (players.length === 2) {
        startGame();
    }

    socket.on('playCard', (cardIndex) => {
        const playerIdx = players.indexOf(socket.id);
        if (playerIdx !== gameState.turn) return;

        const playerHand = gameState.hands[socket.id].hand;
        const card = playerHand[cardIndex];
        const topCard = gameState.pile[gameState.pile.length - 1];

        // Basic Palace Logic: 2 resets, 10 burns, others must be higher
        if (!topCard || card.value >= topCard.value || card.value === 2 || card.value === 10) {
            gameState.pile.push(playerHand.splice(cardIndex, 1)[0]);
            
            // Draw back up to 5 if deck isn't empty
            if (playerHand.length < 5 && gameState.deck.length > 0) {
                playerHand.push(gameState.deck.pop());
            }

            // Special card: 10 clears the pile
            if (card.value === 10) {
                gameState.pile = [];
            } else {
                gameState.turn = (gameState.turn + 1) % 2;
            }
        }
        io.emit('gameState', gameState);
    });

    socket.on('disconnect', () => {
        players = players.filter(id => id !== socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));