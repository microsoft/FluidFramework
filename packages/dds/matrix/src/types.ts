/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// TODO: We temporarily duplicate these contracts from 'framework/undo-redo' to unblock development
//       of SharedMatrix undo while we decide on the correct layering for undo.

export interface IRevertable {  // [sic]
    revert();
    disgard();  // [sic]
}

export interface IUndoConsumer {
    pushToCurrentOperation(revertible: IRevertable);
}
