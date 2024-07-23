/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambda, LambdaCloseType } from "./lambdas";
import { IQueuedMessage } from "./queue";

/**
 * A lambda that passes the same message to one or more lambdas
 * @internal
 */
export class CombinedLambda implements IPartitionLambda {
	constructor(protected readonly lambdas: IPartitionLambda[]) {}

	/**
	 * {@inheritDoc IPartitionLambda.handler}
	 */
	public handler(message: IQueuedMessage) {
		const promises: Promise<void>[] = [];

		for (const lambda of this.lambdas) {
			const optionalPromise = lambda.handler(message);
			if (optionalPromise !== undefined) {
				promises.push(optionalPromise);
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return promises.length > 0 ? (Promise.all(promises) as any) : undefined;
	}

	/**
	 * Closes the lambda. After being called handler will no longer be invoked and the lambda is expected to cancel
	 * any deferred work.
	 */
	public close(closeType: LambdaCloseType): void {
		for (const lambda of this.lambdas) {
			lambda.close(closeType);
		}
	}
}
