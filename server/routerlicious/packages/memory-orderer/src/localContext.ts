/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContext,
	IContextErrorData,
	ILogger,
	IQueuedMessage,
} from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class LocalContext implements IContext {
	constructor(public readonly log: ILogger | undefined) {}

	public checkpoint(queuedMessage: IQueuedMessage): void {
		return;
	}

	public error(error: any, errorData: IContextErrorData): void {
		return;
	}

	public pause(offset: number, reason?: any): void {
		return;
	}

	public resume(): void {
		return;
	}
}
