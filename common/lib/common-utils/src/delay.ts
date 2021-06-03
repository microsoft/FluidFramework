/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Returns a promise that resolves after timeMs
 * @param timeMs - time in milliseconds to wait
 */
export const delay = async (timeMs: number): Promise<void> =>
    new Promise((resolve) => setTimeout(() => resolve(), timeMs));
