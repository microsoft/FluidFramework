/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IReadinessCheck, ISecretManager } from "@fluidframework/server-services-core";
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
	/**
	 * Encrypts and decrypts tenant keys at rest. Defaults to the pass-through
	 * implementation in `@fluidframework/server-services`, which stores keys unencrypted.
	 * Supply one to encrypt tenant keys with a key-encryption key of your choosing.
	 */
	secretManager?: ISecretManager;
}
