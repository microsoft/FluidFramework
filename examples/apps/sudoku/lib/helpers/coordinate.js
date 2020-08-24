/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Coordinate {
    /**
     * Returns a 2-item array of individual coordinates as strings.
     *
     * @param coord - A coordinate string in the form returned by `Coordinate.asString()`.
     */
    static asArray(coord) {
        const arr = coord.split(",", 2);
        return [arr[0], arr[1]];
    }
    /**
     * Returns a 2-item array of individual coordinates as numbers.
     *
     * @param coord - A coordinate string in the form returned by `Coordinate.asString()`.
     */
    static asArrayNumbers(coord) {
        return Coordinate.asArray(coord).map(Number);
    }
    static moveUp(coord) {
        const [row, column] = Coordinate.asArrayNumbers(coord);
        const newRow = row - 1 < 0 ? 0 : row - 1;
        return Coordinate.asString(newRow, column);
    }
    static moveDown(coord) {
        const [row, column] = Coordinate.asArrayNumbers(coord);
        const newRow = row + 1 < 0 ? 0 : row + 1;
        return Coordinate.asString(newRow, column);
    }
    static moveLeft(coord) {
        const [row, column] = Coordinate.asArrayNumbers(coord);
        const newColumn = column - 1 < 0 ? 0 : column - 1;
        return Coordinate.asString(row, newColumn);
    }
    static moveRight(coord) {
        const [row, column] = Coordinate.asArrayNumbers(coord);
        const newColumn = column + 1 > 9 ? 0 : column + 1;
        return Coordinate.asString(row, newColumn);
    }
}
/**
 * Given two numbers, returns a 2-dimensional coordinate string.
 */
Coordinate.asString = (row, column) => `${row},${column}`;
//# sourceMappingURL=coordinate.js.map