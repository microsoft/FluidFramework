/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/** Create a result collection grouped by source tenant. */
export function createResults(inventory) {
	const tenants = {};
	for (const [tenantId, tenant] of Object.entries(inventory.tenants)) {
		tenants[tenantId] = {
			selfHostTenantId: tenant.selfHostTenantId || tenantId,
			successful: [],
			failed: [],
		};
	}
	return { generatedAt: new Date().toISOString(), tenants };
}

export function recordSuccess(results, tenantId, documentId) {
	results.tenants[tenantId].successful.push({ documentId });
}

export function recordFailure(results, tenantId, failure) {
	results.tenants[tenantId].failed.push(failure);
}
