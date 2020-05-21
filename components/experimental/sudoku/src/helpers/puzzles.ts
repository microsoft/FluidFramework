/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from "@fluidframework/map";
import * as sudoku from "sudokus";
import { Coordinate } from "./coordinate";
import { SudokuCell } from "./sudokuCell";

/**
 * An array of numbers 0-9 for convenient looping when building Sudoku grids.
 */
export const PUZZLE_INDEXES = Array.from(Array(9).keys());

export const PUZZLES = [
    [
        [0, 0, 2, 0, 6, 8, 0, 9, 7],
        [4, 0, 6, 3, 0, 9, 0, 0, 0],
        [0, 0, 0, 2, 0, 0, 0, 3, 5],
        [0, 0, 7, 0, 0, 0, 0, 5, 8],
        [6, 0, 8, 0, 0, 0, 7, 0, 4],
        [5, 2, 0, 0, 0, 0, 9, 0, 0],
        [1, 9, 0, 0, 0, 3, 0, 0, 0],
        [0, 0, 0, 7, 0, 4, 8, 0, 9],
        [8, 7, 0, 1, 9, 0, 3, 0, 0],
    ],
    [
        [0, 0, 0, 2, 9, 0, 1, 0, 0],
        [6, 0, 0, 5, 0, 1, 0, 7, 0],
        [0, 0, 0, 0, 0, 0, 0, 3, 4],
        [0, 0, 0, 0, 0, 0, 9, 4, 0],
        [4, 5, 0, 3, 0, 0, 0, 6, 2],
        [2, 0, 9, 0, 0, 4, 3, 1, 0],
        [0, 2, 0, 0, 0, 0, 4, 9, 0],
        [0, 0, 6, 0, 0, 8, 0, 0, 0],
        [0, 4, 3, 0, 2, 0, 0, 8, 7],
    ],
];

/**
 * Loads a puzzle into an ISharedMap.
 *
 * @param index - The index of the puzzle to load.
 * @param puzzleMap - The shared map that stores puzzle data.
 * @returns The solved puzzle as a 2-dimensional array.
 */
export function loadPuzzle(index: number, puzzleMap: ISharedMap): number[][] {
    const puzzleInput = PUZZLES[index];
    const solution = sudoku.solve(puzzleInput);

    for (const row of PUZZLE_INDEXES) {
        for (const col of PUZZLE_INDEXES) {
            const key = Coordinate.asString(row, col);
            const cell = new SudokuCell(puzzleInput[row][col], solution[row][col], key);
            puzzleMap.set(key, cell);
        }
    }
    return solution;
}
