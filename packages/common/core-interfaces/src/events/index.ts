/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	createEmitter,
	EventEmitter,
	type IEmitter,
	type NoListenersCallback,
	type HasListeners,
} from "./emitter.js";

export {
	type Listeners,
	type Listenable,
	type Off,
	type IsListener,
} from "./listeners.js";
