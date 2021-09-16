/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/export */

// Can't use the more compact syntax due to https://github.com/microsoft/rushstack/issues/2780
// import { map } from "./map";
// import { sequence } from "./sequence";

export * from "./containerDefinitions";
export * from "./fluidStatic";

import * as map from "@fluidframework/map";
import * as sequence from "@fluidframework/sequence";

export { map, sequence };
