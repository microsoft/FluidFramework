/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "./deferred";
import { IPendingBoxcar } from "./queue";

// 1MB batch size / (16KB max message size + overhead)
/**
 * @internal
 */
export const MaxBatchSize = 32;

/**
 * @internal
 */
export class PendingBoxcar implements IPendingBoxcar {
	public deferred = new Deferred<void>();
	public messages: any[] = [];
	public partitionId?: number;

	constructor(
		public tenantId: string,
		public documentId: string,
	) {}
}
