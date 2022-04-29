/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import generateStupidName from "sillyname";

export function getRandomName(connector = "_", capitalize = false): string {
    let [first, last] = (generateStupidName() as string).split(" ");

    // sillyname output is capitalized by default
    if (!capitalize) {
       first = first.toLowerCase();
       last = last.toLowerCase();
    }

    return `${first}${connector}${last}`;
}

// Exposing a choose() function to align with moniker's API. Moniker is
// server-only, and we can swap it out with this function for the browser.
export const choose = (): string =>
    getRandomName();
