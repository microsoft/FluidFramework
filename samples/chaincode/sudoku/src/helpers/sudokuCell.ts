/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as sudoku from "sudokus";
import { CoordinateString } from "./coordinate";

export enum CellState {
    empty = "empty",
    fixed = "fixed",
    wrong = "wrong",
    correct = "correct",
}

/**
 * The SudokuCell class is used to store data about a cell in the Sudoku grid. The class is intended to be
 * JSON-serialized, so static get/set methods are provided for common data manipulation needs rather than functions on a
 * class instance.
 */
export class SudokuCell implements sudoku.Cell {
    /**
     * True if the cell is one of the starting "clues" in the Sudoku; false otherwise.
     */
    public readonly fixed: boolean;

    /**
     * True if the value in the cell is correct; false otherwise.
     */
    public isCorrect = false;

    /**
     * Creates a new SudokuCell instance.
     *
     * @param value - The value of the cell to initialize. Can be any single digit 0-9. 0 indicates an empty cell.
     * Invalid values will be treated as 0.
     * @param correctValue - The correct (solved) value of the cell.
     * @param coordinate - The coordinate of the cell in the grid.
     */
    public constructor(
        public value: number,
        public readonly correctValue: number,
        public readonly coordinate: CoordinateString
    ) {
        if (!Number.isSafeInteger(value)) {
            this.value = 0;
        }
        this.fixed = value !== 0;
        SudokuCell.setIsCorrect(this);
    }

    public toString(): string {
        return `SudokuCell: ${JSON.stringify(this)}`;
    }

    // The following are static methods since TypeScript properties are functions and functions aren't JSONed, and we
    // need to be manipulate the plain JavaScript objects after they've been JSONed.

    /**
     * Sets the isCorrect property on the cell and returns the cell.
     */
    public static setIsCorrect(cell: SudokuCell): SudokuCell {
        cell.isCorrect = cell.fixed || cell.value === cell.correctValue;
        return cell;
    }

    /**
     * Returns a string representation of the cell's value suitable for display.
     */
    public static getDisplayString(cell: SudokuCell): string {
        if (cell.fixed || cell.value !== 0) {
            return cell.value.toString();
        }
        return "";
    }

    /**
     * Returns the appropriate CellState for the cell. This state can be used to render the cell differently.
     */
    public static getState(cell: SudokuCell): CellState {
        if (cell.value === 0) {
            return CellState.empty;
        }

        if (cell.fixed) {
            return CellState.fixed;
        }

        if (cell.isCorrect) {
            return CellState.correct;
        }

        return CellState.wrong;
    }
}
