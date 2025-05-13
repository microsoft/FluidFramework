/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IRedisClientConnectionManager,
	ITenantKeyGenerator,
} from "@fluidframework/server-services-utils";
import { ITenantRepository } from "./mongoTenantRepository";
import { IReadinessCheck } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export interface IRiddlerResourcesCustomizations {
	tenantRepository?: ITenantRepository;
	redisClientConnectionManagerForTenantCache?: IRedisClientConnectionManager;
	tenantKeyGenerator?: ITenantKeyGenerator;
	readinessCheck?: IReadinessCheck;
}
