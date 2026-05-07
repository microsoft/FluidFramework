/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	IRevertible,
	ISharedArray,
	ISharedArrayEvents,
	ISharedArrayRevertible,
	SerializableTypeForSharedArray,
} from "./interfaces.js";
export {
	SharedArray,
	SharedArrayBuilder,
	SharedArrayFactory,
} from "./sharedArrayFactory.js";
export type {
	IDeleteOperation,
	IInsertOperation,
	IMoveOperation,
	ISharedArrayOperation,
	ISharedArrayRevertibleOperation,
	IToggleMoveOperation,
	IToggleOperation,
} from "./sharedArrayOperations.js";
export { OperationType } from "./sharedArrayOperations.js";
export { SharedArrayRevertible } from "./sharedArrayRevertible.js";
