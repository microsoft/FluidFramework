/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ITenantCustomData,
	ITenantOrderer,
	ITenantStorage,
} from "@fluidframework/server-services-core";

/**
 * Tenant details stored to the document database
 * @internal
 */
export interface ITenantDocument {
	// Database ID for the tenant. Id is only marked optional because the database will provide it
	// on initial insert
	_id: string;

	// API key for the given tenant
	key: string;

	// second key for the given tenant
	secondaryKey: string;

	// Storage provider details
	storage: ITenantStorage;

	// Orderer details
	orderer: ITenantOrderer;

	// Custom data for tenant extensibility
	customData: ITenantCustomData;

	// Whether the tenant is disabled
	disabled: boolean;

	// Timestamp of when this tenant will be hard deleted.
	// Only applicable if the tenant is disabled.
	scheduledDeletionTime?: string;
}
