/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITenantRepository } from "./mongoTenantRepository";

export interface IRiddlerResourcesCustomizations {
	tenantRepository?: ITenantRepository;
}
