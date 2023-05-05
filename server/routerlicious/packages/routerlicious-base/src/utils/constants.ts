/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export const Constants = Object.freeze({
	alfredRestThrottleIdSuffix: "AlfredRest",
	createDocThrottleIdPrefix: "createDoc",
	getDeltasThrottleIdPrefix: "getDeltas",
	getSessionThrottleIdPrefix: "getSession",
	socketConnectionsThrottleIdPrefix: "socketConnections",
	submitOpsThrottleIdPrefix: "submitOps",
	submitSignalThrottleIdPrefix: "submitSignal",
	generalRestCallThrottleIdPrefix: "generalRestCall",
	perTenantThrottler: "perTenant",
	perClusterThrottler: "perCluster",
	tenantsGroup1PerTenantThrottler: "tenantsGroup1PerTenant",
});
