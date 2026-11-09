/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IReadinessCheck } from "@fluidframework/server-services-core";
import type { IRedisClientConnectionManager } from "@fluidframework/server-services-utils";

import type { IRepoManagerParams } from "./utils";

export interface InitialSummaryLifecycle {
	onInitialSummaryWriteSuccess(params: IRepoManagerParams): Promise<void>;
}

export interface IGitrestResourcesCustomizations {
	redisClientConnectionManagerForDefaultFileSystem?: IRedisClientConnectionManager;
	redisClientConnectionManagerForEphemeralFileSystem?: IRedisClientConnectionManager;
	readinessCheck?: IReadinessCheck;
	initialSummaryLifecycle?: InitialSummaryLifecycle;
}
