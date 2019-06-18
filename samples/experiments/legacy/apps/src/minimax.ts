/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface ICell {
    index: number;
    player: number;
}

interface IMove {
    index: number;
    score: number;
}

const huPlayer = "X";
const aiPlayer = "O";

// This function is stateless. For each call, it creates a new board and calculates the next best move.
export function getNextSpot(occupied: ICell[]): number {
    const board = [];
    for (let i = 0; i < 9; ++i) {
        board.push(i);
    }
    for (const cell of occupied) {
        if (cell.player === 1) {
            board[cell.index] = huPlayer;
        } else if (cell.player === 2) {
            board[cell.index] = aiPlayer;
        }
    }
    return minimax(board, aiPlayer).index;
}

// The main minimax function that calculates the next move.
// Essentially it simulates each possible move and calculate back from terminal state.
function minimax(newBoard: string[], player: string) {

    // Find available spots
    const availSpots = emptyIndexies(newBoard);

    // Checks for the terminal states such as win, lose, and tie and returns a value accordingly
    if (winning(newBoard, huPlayer)) {
        return { score: -10, index: -1 };
    } else if (winning(newBoard, aiPlayer)) {
        return { score: 10, index: -1};
    } else if (availSpots.length === 0) {
        return {score: 0, index: -1};
    }

    const moves: IMove[] = [];

    // Loop through available spots
    for (const spot of availSpots) {
        // Create an object for each spot and store the index of that spot
        const move: IMove = {index: newBoard[spot], score: -1};

        // Set the empty spot to the current player
        newBoard[spot] = player;

        // Collect the score resulted from calling minimax on the opponent of the current player
        if (player === aiPlayer) {
            const result = minimax(newBoard, huPlayer);
            move.score = result.score;
        } else {
            const result = minimax(newBoard, aiPlayer);
            move.score = result.score;
        }

        // Reset the spot to empty
        newBoard[spot] = move.index;

        // Push the object to the array
        moves.push(move);
    }

    // AI's turn. Loop over the moves and choose the move with the highest score
    let bestMove;
    if (player === aiPlayer) {
        let bestScore = -999999;
        for (let i = 0; i < moves.length; i++) {
            if (moves[i].score > bestScore) {
                bestScore = moves[i].score;
                bestMove = i;
            }
        }
    } else { // Else loop over the moves and choose the move with the lowest score
        let bestScore = 999999;
        for (let i = 0; i < moves.length; i++) {
            if (moves[i].score < bestScore) {
                bestScore = moves[i].score;
                bestMove = i;
            }
        }
    }

    // Return the chosen move (object) from the array to the higher depth
    return moves[bestMove];
}

// Returns the available spots on the board
function emptyIndexies(board): string[] {
    return board.filter((s) => s !== "O" && s !== "X");
}

// Checks if a player won the game.
function winning(board: string[], player: string): boolean {
    if (
          (board[0] === player && board[1] === player && board[2] === player) ||
          (board[3] === player && board[4] === player && board[5] === player) ||
          (board[6] === player && board[7] === player && board[8] === player) ||
          (board[0] === player && board[3] === player && board[6] === player) ||
          (board[1] === player && board[4] === player && board[7] === player) ||
          (board[2] === player && board[5] === player && board[8] === player) ||
          (board[0] === player && board[4] === player && board[8] === player) ||
          (board[2] === player && board[4] === player && board[6] === player)
        ) {
        return true;
    } else {
        return false;
    }
}
