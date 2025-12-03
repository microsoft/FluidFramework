/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	SharedArrayFactory,
	SharedArray,
	SharedArrayBuilder,
} from "./sharedArrayFactory.js";
export { SharedArrayRevertible } from "./sharedArrayRevertible.js";
export type {
	SerializableTypeForSharedArray,
	ISharedArray,
	ISharedArrayEvents,
	ISharedArrayRevertible,
	IRevertible,
} from "./interfaces.js";
export type {
	ISharedArrayOperation,
	IInsertOperation,
	IDeleteOperation,
	IMoveOperation,
	ISharedArrayRevertibleOperation,
	IToggleMoveOperation,
	IToggleOperation,
} from "./sharedArrayOperations.js";
export { OperationType } from "./sharedArrayOperations.js";
