/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITaskMessage, ITaskMessageSender } from "@fluidframework/server-services-core";

/**
 * @deprecated This was functionality related to RabbitMq which is not used anymore,
 * and will be removed in a future release.
 */
export class TaskMessageSender implements ITaskMessageSender {
	public initialize(): Promise<void> {
		throw new Error("Method not implemented.");
	}

	public sendTask(queueName: string, message: ITaskMessage): void {
		throw new Error("Method not implemented.");
	}

	public on(event: string, listener: (...args: any[]) => void): this {
		throw new Error("Method not implemented.");
	}

	public close(): Promise<void> {
		throw new Error("Method not implemented.");
	}
}
