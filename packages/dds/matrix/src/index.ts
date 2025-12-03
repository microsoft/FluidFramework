/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type { ISharedMatrixEvents, ISharedMatrix } from "./matrix.js";
export type { MatrixItem } from "./ops.js";
export { SharedMatrixFactory, SharedMatrix } from "./runtime.js";

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
//       of SharedMatrix undo while we decide on the correct layering for undo.
export type { IUndoConsumer, IRevertible } from "./types.js";
