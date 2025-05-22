/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { SharedArrayFactory, SharedArray } from "./sharedArrayFactory.js";
export { SharedArrayRevertible } from "./sharedArrayRevertible.js";
export type {
	SerializableTypeForSharedArray,
	ISharedArray,
	ISharedArrayEvents,
	ISharedArrayRevertible,
	FullyReadonly,
	IRevertible,
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
