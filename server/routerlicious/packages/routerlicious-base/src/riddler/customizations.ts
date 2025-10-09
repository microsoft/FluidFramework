/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IReadinessCheck } from "@fluidframework/server-services-core";
import type {
	IRedisClientConnectionManager,
	ITenantKeyGenerator,
} from "@fluidframework/server-services-utils";

import type { ITenantRepository } from "./mongoTenantRepository";

/**
 * @internal
 */
export interface IRiddlerResourcesCustomizations {
	tenantRepository?: ITenantRepository;
	redisClientConnectionManagerForTenantCache?: IRedisClientConnectionManager;
	tenantKeyGenerator?: ITenantKeyGenerator;
	readinessCheck?: IReadinessCheck;
}
