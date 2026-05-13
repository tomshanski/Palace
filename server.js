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
    hands: {}, 
    lastPlayerId: null
};

function createDeck() {
    const suits = ['♠', '♣', '♥', '♦'];
    const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
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
            hand: gameState.deck.splice(0, 3),
            faceUp: gameState.deck.splice(0, 3),
            faceDown: gameState.deck.splice(0, 3)
        };
    });
    gameState.pile = [];
    gameState.turn = 0;
    io.emit('gameState', gameState);
}

function checkFourOfAKind(pile) {
    if (pile.length < 4) return false;
    const lastFour = pile.slice(-4);
    return lastFour.every(c => c.value === lastFour[0].value);
}

io.on('connection', (socket) => {
    if (players.length < 2) players.push(socket.id);
    if (players.length === 2) startGame();

    socket.on('playCard', ({ cardIndex, type }) => {
        const playerIdx = players.indexOf(socket.id);
        if (playerIdx !== gameState.turn) return;

        const pHand = gameState.hands[socket.id];
        let card;
        
        // Ensure player plays in order: Hand -> FaceUp -> FaceDown
        if (type === 'hand') card = pHand.hand[cardIndex];
        else if (type === 'faceUp' && pHand.hand.length === 0) card = pHand.faceUp[cardIndex];
        else if (type === 'faceDown' && pHand.hand.length === 0 && pHand.faceUp.length === 0) card = pHand.faceDown[cardIndex];
        else return; // Invalid move type

        const topCard = gameState.pile[gameState.pile.length - 1];
        let canPlay = false;

        // PALACE LOGIC
        if (!topCard || topCard.value === 2) {
            canPlay = true;
        } else if (topCard.value === 7) {
            if (card.value <= 7 || card.value === 2 || card.value === 10) canPlay = true;
        } else {
            if (card.value >= topCard.value || card.value === 2 || card.value === 10) canPlay = true;
        }

        if (canPlay) {
            // Remove card from player source
            pHand[type].splice(cardIndex, 1);
            gameState.pile.push(card);

            // Logic for 10 or 4-of-a-kind (Burn)
            if (card.value === 10 || checkFourOfAKind(gameState.pile)) {
                gameState.pile = [];
                // Player goes again on a burn
            } else {
                gameState.turn = (gameState.turn + 1) % 2;
            }

            // Draw up to 3 cards
            while (pHand.hand.length < 3 && gameState.deck.length > 0) {
                pHand.hand.push(gameState.deck.pop());
            }
        } else if (type === 'faceDown') {
            // If blind face-down play fails, you must pick up the pile + the failed card
            pHand.hand.push(...gameState.pile, card);
            pHand.faceDown.splice(cardIndex, 1);
            gameState.pile = [];
            gameState.turn = (gameState.turn + 1) % 2;
        }

        io.emit('gameState', gameState);
    });

    socket.on('pickUp', () => {
        const playerIdx = players.indexOf(socket.id);
        if (playerIdx !== gameState.turn) return;

        gameState.hands[socket.id].hand.push(...gameState.pile);
        gameState.pile = [];
        gameState.turn = (gameState.turn + 1) % 2;
        io.emit('gameState', gameState);
    });
});

server.listen(3000);
