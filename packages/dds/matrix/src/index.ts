/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export { ISharedMatrixEvents, SharedMatrix } from "./matrix";
export { MatrixItem } from "./ops";
export { SharedMatrixFactory } from "./runtime";

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
//       of SharedMatrix undo while we decide on the correct layering for undo.
export { IUndoConsumer, IRevertible } from "./types";

// types used in Protected fields in SharedMatrix
/*
export { PermutationVector } from "./permutationvector";
export { SparseArray2D } from "./sparsearray2d";
export { MatrixUndoProvider } from "./undoprovider";
export { Handle } from "./handletable";
*/