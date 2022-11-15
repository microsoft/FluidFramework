/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
//       of SharedMatrix undo while we decide on the correct layering for undo.

export interface IRevertible {
    revert();
    discard();
}

export interface IUndoConsumer {
    pushToCurrentOperation(revertible: IRevertible);
}
