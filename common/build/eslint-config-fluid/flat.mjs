/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// ESM loader wrapper that uses jiti to load the TypeScript flat.mts file
import jiti from "jiti";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const jitiLoader = jiti(__filename, { interopDefault: true, esmResolve: true });

// Load and re-export everything from the .mts file
const config = jitiLoader("./flat.mts");

export const { recommended, strict, minimalDeprecated } = config;
export default config.default;
