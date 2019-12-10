/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function getRandomInt(range: number) {
    // getRandomInt is not and should not be used as part of any secure random number generation
    // tslint:disable-next-line
    return Math.floor(Math.random() * range);
}
