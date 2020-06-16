/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import generateName from "sillyname";

// Exposing a choose() function to align with moniker's API. Moniker is
// server-only, and we can swap it out with this function for the browser.
export const choose = (): string =>
    generateName().replace(" ", "_").toLowerCase();
