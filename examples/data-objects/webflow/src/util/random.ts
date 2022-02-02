/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Returns a pseudo-random string suitable for avoiding 'id' collisions between DOM elements.
 */
export const randomId = () =>
    Math.random().toString(36).slice(2);
