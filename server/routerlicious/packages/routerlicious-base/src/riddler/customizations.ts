/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantRepository } from "./mongoTenantRepository";

/**
 * @internal
 */
export interface IRiddlerResourcesCustomizations {
	tenantRepository?: ITenantRepository;
}
