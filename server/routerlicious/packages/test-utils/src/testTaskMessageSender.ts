/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITaskMessage, ITaskMessageSender } from "@microsoft/fluid-server-services-core";

export class TestTaskMessageSender implements ITaskMessageSender {
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public initialize(): Promise<void> {
        return Promise.resolve();
    }

    public sendTask(queueName: string, message: ITaskMessage): void {
        // Do nothing
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        return this;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public close(): Promise<void> {
        return Promise.resolve();
    }
}
