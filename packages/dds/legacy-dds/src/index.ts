/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */
export type {
	SerializableTypeForSharedSignal,
	ISharedSignal,
	ISharedSignalEvents,
	ISignalOperation,
} from "./signal/interfaces.js";
export { SharedSignal } from "./signal/sharedSignal.js";
export { SharedSignalFactory } from "./signal/sharedSignalFactory.js";
