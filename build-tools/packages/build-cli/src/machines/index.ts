/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnifiedReleaseMachine } from "./unifiedReleaseMachine";

export { UnifiedReleaseMachine } from "./unifiedReleaseMachine";

export { StateMachine, StateHandler } from "./types";

/**
 * An array of all known machines. Intended for testing.
 *
 * @internal
 */
export const allMachines = [UnifiedReleaseMachine];
