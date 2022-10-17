/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

const enum DirectionFlag {
    // Bitmasks used to encode Direction as a pair of 2-bit signed integers
    horizontal = 1 << 0,       // DeltaX = 1
    negativeHorizontal = 1 << 1,       // DeltaX = -DeltaX
    vertical = 1 << 2,       // DeltaY = 1
    negativeVertical = 1 << 3,       // DeltaY = -DeltaY

    // Left/Right shifts used to extract encoded DeltaX/Y from Int32.
    horizontalLsh = 32 - 2,
    horizontalRsh = 32 - 2,
    verticalLsh = 32 - 4,
    verticalRsh = 32 - 2,
}

export const enum Direction {
    none = 0,
    left = DirectionFlag.horizontal | DirectionFlag.negativeHorizontal,
    right = DirectionFlag.horizontal,
    up = DirectionFlag.vertical | DirectionFlag.negativeVertical,
    down = DirectionFlag.vertical,
}

export const enum TabDirection {
    backward = -1,
    forward = 1,
}

export function getDeltaX(direction: Direction) {
    return (direction << DirectionFlag.horizontalLsh) >> DirectionFlag.horizontalRsh;
}

export function getDeltaY(direction: Direction) {
    return (direction << DirectionFlag.verticalLsh) >> DirectionFlag.verticalRsh;
}

export function getTabDirection(direction: Direction): TabDirection {
    return getDeltaX(direction) || getDeltaY(direction);
}

/* eslint-enable no-bitwise */
