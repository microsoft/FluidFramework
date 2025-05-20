/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { SharedArray } from "./sharedArray.js";
export { SharedArrayFactory } from "./sharedArrayFactory.js";
export { SharedArrayRevertible } from "./sharedArrayRevertible.js";
export type {
	SerializableTypeForSharedArray,
	ISharedArray,
	ISharedArrayEvents,
	ISharedArrayRevertible,
	FullyReadonly,
} from "./interfaces.js";
export type {
	ISharedArrayOperation,
	IInsertOperation,
	IDeleteOperation,
	IMoveOperation,
	ISharedArrayRevertibleOperation,
	OperationType,
	IToggleMoveOperation,
	IToggleOperation,
} from "./sharedArrayOperations.js";
export type { IRevertible } from "./types.js";
