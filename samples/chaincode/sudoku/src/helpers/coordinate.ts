/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This type wrapper around string is useful within this codebase to differentiate functions that are expecting strings
 * in a particular format - a CoordinateString - vs those that expect "any old string."
 */
export type CoordinateString = string;

export class Coordinate {
    /**
     * Given two numbers, returns a 2-dimensional coordinate string.
     */
    public static asString = (row: number, column: number): CoordinateString => {
        return `${row},${column}`;
    }

    /**
     * Returns a 2-item array of individual coordinates as strings.
     *
     * @param coord - A coordinate string in the form returned by `Coordinate.asString()`.
     */
    public static asArray(coord: CoordinateString): string[] {
        const arr = coord.split(",", 2);
        return [arr[0], arr[1]];
    }

    /**
     * Returns a 2-item array of individual coordinates as numbers.
     *
     * @param coord - A coordinate string in the form returned by `Coordinate.asString()`.
     */
    public static asArrayNumbers(coord: CoordinateString): number[] {
        return Coordinate.asArray(coord).map(Number);
    }
}
