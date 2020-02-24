/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, ILogger, IQueuedMessage } from "@microsoft/fluid-server-services-core";

export class LocalContext implements IContext {
    constructor(public readonly log: ILogger) {}

    public checkpoint(queuedMessage: IQueuedMessage) {
        return;
    }

    public error(error: any, restart: boolean) {
        return;
    }
}
