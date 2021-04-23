/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IContextErrorData, ILogger, IQueuedMessage } from "@fluidframework/server-services-core";

export class LocalContext implements IContext {
    constructor(public readonly log: ILogger | undefined) { }

    public checkpoint(queuedMessage: IQueuedMessage) {
        return;
    }

    public error(error: any, errorData: IContextErrorData) {
        return;
    }
}
