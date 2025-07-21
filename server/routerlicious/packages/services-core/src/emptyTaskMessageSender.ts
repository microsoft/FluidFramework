/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITaskMessage, ITaskMessageSender } from "./taskMessages";

/**
 * @deprecated This was functionality related to RabbitMq which is not used anymore,
 * and will be removed in a future release.
 * @internal
 */
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
