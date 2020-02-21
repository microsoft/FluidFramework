/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IQueuedMessage } from "@microsoft/fluid-server-services-core";

export class LocalContext implements IContext {
    public checkpoint(queuedMessage: IQueuedMessage) {
        return;
    }

    public error(error: any, restart: boolean) {
        return;
    }
}
