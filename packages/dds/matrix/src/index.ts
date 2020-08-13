/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export { SharedMatrix } from "./matrix";
export { SharedMatrixFactory } from "./runtime";

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
//       of SharedMatrix undo while we decide on the correct layering for undo.
export { IUndoConsumer, IRevertable } from "./types";
