/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * getRandomInt is not and should not be used as part of any secure random number generation
 */
export const getRandomInt = (range: number) =>
    Math.floor(Math.random() * range);
