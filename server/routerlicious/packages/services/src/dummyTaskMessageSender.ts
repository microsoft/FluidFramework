/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITaskMessage, ITaskMessageSender } from "@fluidframework/server-services-core";

export class DummyTaskMessageSender implements ITaskMessageSender {
    public async initialize(): Promise<void> {
        return new Promise(function(resolve, reject) {resolve();});
    }

    public sendTask(queueName: string, message: ITaskMessage): void {
        return;
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    public async close(): Promise<void> {
        return;
    }
}
