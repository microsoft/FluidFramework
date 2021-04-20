/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITaskMessage, ITaskMessageSender } from "./taskMessages";

export class EmptyTaskMessageSender implements ITaskMessageSender {
    public async initialize(): Promise<void> {
        return;
    }

    public sendTask(queueName: string, message: ITaskMessage): void {
        // Do nothing
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    public async close(): Promise<void> {
        return;
    }
}
