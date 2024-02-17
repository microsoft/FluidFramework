/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRedisClientConnectionManager } from "./redisClientConnectionManager";

export interface IGitrestResourcesCustomizations {
	redisClientConnectionManagerForDefaultFileSystem?: IRedisClientConnectionManager;
	redisClientConnectionManagerForEphemeralFileSystem?: IRedisClientConnectionManager;
}
