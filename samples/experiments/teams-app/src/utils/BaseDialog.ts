/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export abstract class BaseDialog {

    constructor (
        protected dialogId: string,
    ) {
        // do nothing
    }

    protected getDialogId(): string {
        return this.dialogId;
    }
}
