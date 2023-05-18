/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as core from "@fluidframework/server-services-core";
import { Constants } from "../utils";

/**
 * Get the tenant level throttlers
 */
export function getTenantThrottlersMap(
	config: Provider,
	configureThrottler: any,
): Map<string, core.IThrottler> {
	const restApiTenantThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:generalRestCall"),
	);
	const restTenantThrottler = configureThrottler(restApiTenantThrottleConfig);
	const restApiTenantCreateDocThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:createDoc"),
	);
	const restTenantCreateDocThrottler = configureThrottler(restApiTenantCreateDocThrottleConfig);
	const restApiTenantGetDeltasThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:getDeltas"),
	);
	const restTenantGetDeltasThrottler = configureThrottler(restApiTenantGetDeltasThrottleConfig);
	const restApiTenantGetSessionThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:getSession"),
	);
	const restTenantGetSessionThrottler = configureThrottler(restApiTenantGetSessionThrottleConfig);
	const socketConnectionThrottleConfigPerTenant = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:socketConnections"),
	);
	const socketConnectTenantThrottler = configureThrottler(
		socketConnectionThrottleConfigPerTenant,
	);
	const submitOpThrottleConfigPerTenant = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:submitOps"),
	);
	const socketSubmitOpTenantThrottler = configureThrottler(submitOpThrottleConfigPerTenant);
	const submitSignalThrottleConfigPerTenant = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenant:submitSignals"),
	);
	const submitSignalTenantThrottler = configureThrottler(submitSignalThrottleConfigPerTenant);
	const tenantThrottlers = new Map<string, core.IThrottler>();
	tenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, restTenantThrottler);
	tenantThrottlers.set(Constants.createDocThrottleIdPrefix, restTenantCreateDocThrottler);
	tenantThrottlers.set(Constants.getDeltasThrottleIdPrefix, restTenantGetDeltasThrottler);
	tenantThrottlers.set(Constants.getSessionThrottleIdPrefix, restTenantGetSessionThrottler);
	tenantThrottlers.set(Constants.socketConnectionsThrottleIdPrefix, socketConnectTenantThrottler);
	tenantThrottlers.set(Constants.submitOpsThrottleIdPrefix, socketSubmitOpTenantThrottler);
	tenantThrottlers.set(Constants.submitSignalThrottleIdPrefix, submitSignalTenantThrottler);
	return tenantThrottlers;
}

/**
 * Get the cluster level throttlers
 */
export function getClusterThrottlersMap(
	config: Provider,
	configureThrottler: any,
): Map<string, core.IThrottler> {
	const restApiCreateDocThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perCluster:createDoc"),
	);
	const restCreateDocThrottler = configureThrottler(restApiCreateDocThrottleConfig);
	const restApiGetDeltasThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perCluster:getDeltas"),
	);
	const restGetDeltasThrottler = configureThrottler(restApiGetDeltasThrottleConfig);
	const restApiGetSessionThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perCluster:getSession"),
	);
	const restGetSessionThrottler = configureThrottler(restApiGetSessionThrottleConfig);
	const socketConnectionThrottleConfigPerCluster = utils.getThrottleConfig(
		config.get("alfred:throttling:perCluster:socketConnections"),
	);
	const socketConnectClusterThrottler = configureThrottler(
		socketConnectionThrottleConfigPerCluster,
	);
	const submitOpThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perCluster:submitOps"),
	);
	const socketSubmitOpThrottler = configureThrottler(submitOpThrottleConfig);
	const submitSignalThrottleConfig = utils.getThrottleConfig(
		config.get("alfred:throttling:perCluster:submitSignals"),
	);
	const socketSubmitSignalThrottler = configureThrottler(submitSignalThrottleConfig);

	const clusterThrottlers = new Map<string, core.IThrottler>();
	clusterThrottlers.set(Constants.createDocThrottleIdPrefix, restCreateDocThrottler);
	clusterThrottlers.set(Constants.getDeltasThrottleIdPrefix, restGetDeltasThrottler);
	clusterThrottlers.set(Constants.getSessionThrottleIdPrefix, restGetSessionThrottler);
	clusterThrottlers.set(
		Constants.socketConnectionsThrottleIdPrefix,
		socketConnectClusterThrottler,
	);
	clusterThrottlers.set(Constants.submitOpsThrottleIdPrefix, socketSubmitOpThrottler);
	clusterThrottlers.set(Constants.submitSignalThrottleIdPrefix, socketSubmitSignalThrottler);
	return clusterThrottlers;
}

/**
 * Get the tenant group 1 level throttlers
 */
export function getTenantGroup1ThrottlersMap(
	config: Provider,
	configureThrottler: any,
): Map<string, core.IThrottler> {
	const CreateDocThrottleConfigTenantGroup1 = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenantGroup1:createDoc"),
	);
	const CreateDocThrottlerTenantGroup1 = configureThrottler(CreateDocThrottleConfigTenantGroup1);
	const GetDeltasThrottleConfigTenantGroup1 = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenantGroup1:getDeltas"),
	);
	const GetDeltasThrottlerTenantGroup1 = configureThrottler(GetDeltasThrottleConfigTenantGroup1);
	const GetSessionThrottleConfigTenantGroup1 = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenantGroup1:getSession"),
	);
	const GetSessionThrottlerTenantGroup1 = configureThrottler(
		GetSessionThrottleConfigTenantGroup1,
	);
	const socketConnectionThrottleConfigTenantGroup1 = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenantGroup1:socketConnections"),
	);
	const socketConnectClusterThrottlerTenantGroup1 = configureThrottler(
		socketConnectionThrottleConfigTenantGroup1,
	);
	const submitOpThrottleConfigTenantGroup1 = utils.getThrottleConfig(
		config.get("alfred:throttling:perTenantGroup1:submitOps"),
	);
	const submitOpThrottlerTenantGroup1 = configureThrottler(submitOpThrottleConfigTenantGroup1);

	const perTenantGroup1Throttlers = new Map<string, core.IThrottler>();
	perTenantGroup1Throttlers.set(
		Constants.createDocThrottleIdPrefix,
		CreateDocThrottlerTenantGroup1,
	);
	perTenantGroup1Throttlers.set(
		Constants.getDeltasThrottleIdPrefix,
		GetDeltasThrottlerTenantGroup1,
	);
	perTenantGroup1Throttlers.set(
		Constants.getSessionThrottleIdPrefix,
		GetSessionThrottlerTenantGroup1,
	);
	perTenantGroup1Throttlers.set(
		Constants.socketConnectionsThrottleIdPrefix,
		socketConnectClusterThrottlerTenantGroup1,
	);
	perTenantGroup1Throttlers.set(
		Constants.submitOpsThrottleIdPrefix,
		submitOpThrottlerTenantGroup1,
	);
	return perTenantGroup1Throttlers;
}
