/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ISharedMatrixEvents, ISharedMatrix } from "./matrix.js";
export { MatrixItem } from "./ops.js";
export { SharedMatrixFactory, SharedMatrix } from "./runtime.js";

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
//       of SharedMatrix undo while we decide on the correct layering for undo.
export { IUndoConsumer, IRevertible } from "./types.js";
