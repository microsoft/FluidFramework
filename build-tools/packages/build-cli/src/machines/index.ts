/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UnifiedReleaseMachineDefinition } from "./unifiedReleaseMachine";

export { UnifiedReleaseMachineDefinition } from "./unifiedReleaseMachine";

export { StateMachineCommand } from "./baseCommand";

export { HandlerData, StateHandlerImpl, UnifiedReleaseHandler } from "./handlers";

export { StateHandler } from "./types";

/**
 * An array of all known machines. Intended for testing.
 *
 * @internal
 * */
export const allMachines = [UnifiedReleaseMachineDefinition];
