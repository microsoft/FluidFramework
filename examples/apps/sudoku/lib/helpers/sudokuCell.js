/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
export var CellState;
(function (CellState) {
    CellState["empty"] = "empty";
    CellState["fixed"] = "fixed";
    CellState["wrong"] = "wrong";
    CellState["correct"] = "correct";
})(CellState || (CellState = {}));
/**
 * The SudokuCell class is used to store data about a cell in the Sudoku grid. The class is intended to be
 * JSON-serialized, so static get/set methods are provided for common data manipulation needs rather than functions on a
 * class instance.
 */
export class SudokuCell {
    /**
     * Creates a new SudokuCell instance.
     *
     * @param value - The value of the cell to initialize. Can be any single digit 0-9. 0 indicates an empty cell.
     * Invalid values will be treated as 0.
     * @param correctValue - The correct (solved) value of the cell.
     * @param coordinate - The coordinate of the cell in the grid.
     */
    constructor(value, correctValue, coordinate) {
        this.value = value;
        this.correctValue = correctValue;
        this.coordinate = coordinate;
        /**
         * True if the value in the cell is correct; false otherwise.
         */
        this.isCorrect = false;
        if (!Number.isSafeInteger(value)) {
            this.value = 0;
        }
        this.fixed = value !== 0;
        SudokuCell.setIsCorrect(this);
    }
    toString() {
        return `SudokuCell: ${JSON.stringify(this)}`;
    }
    // The following are static methods since TypeScript properties are functions and functions aren't JSONed, and we
    // need to be manipulate the plain JavaScript objects after they've been JSONed.
    /**
     * Sets the isCorrect property on the cell and returns the cell.
     */
    static setIsCorrect(cell) {
        cell.isCorrect = cell.fixed || cell.value === cell.correctValue;
        return cell;
    }
    /**
     * Returns a string representation of the cell's value suitable for display.
     */
    static getDisplayString(cell) {
        if (cell.fixed || cell.value !== 0) {
            return cell.value.toString();
        }
        return "";
    }
    /**
     * Returns the appropriate CellState for the cell. This state can be used to render the cell differently.
     */
    static getState(cell) {
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
//# sourceMappingURL=sudokuCell.js.map