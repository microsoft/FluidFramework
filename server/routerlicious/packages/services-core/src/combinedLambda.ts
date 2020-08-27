/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambda } from "./lambdas";
import { IQueuedMessage } from "./queue";

/**
 * A lambda that passes the same message to one or more lambdas
 */
export class CombinedLambda implements IPartitionLambda {
	constructor(protected readonly lambdas: IPartitionLambda[]) {
	}

	/**
	 * Processes an incoming message
	 */
	public handler(message: IQueuedMessage): void {
		for (const lambda of this.lambdas) {
			lambda.handler(message);
		}
	}

	/**
	 * Closes the lambda. After being called handler will no longer be invoked and the lambda is expected to cancel
	 * any deferred work.
	 */
	public close(): void {
		for (const lambda of this.lambdas) {
			lambda.close();
		}
	}
}
