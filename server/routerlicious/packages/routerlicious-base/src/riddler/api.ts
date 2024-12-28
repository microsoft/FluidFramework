/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getRandomName } from "@fluidframework/server-services-client";
import {
	ISecretManager,
	ITenantStorage,
	ITenantOrderer,
	ITenantCustomData,
	ICache,
} from "@fluidframework/server-services-core";
import { handleResponse } from "@fluidframework/server-services";
import { Router } from "express";
import { ITenantKeyGenerator } from "@fluidframework/server-services-utils";
import { decode } from "jsonwebtoken";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { getGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";
import { TenantManager } from "./tenantManager";
import { ITenantRepository } from "./mongoTenantRepository";

export function create(
	tenantRepository: ITenantRepository,
	baseOrderUrl: string,
	defaultHistorianUrl: string,
	defaultInternalHistorianUrl: string,
	secretManager: ISecretManager,
	fetchTenantKeyMetricInterval: number,
	riddlerStorageRequestMetricInterval: number,
	tenantKeyGenerator: ITenantKeyGenerator,
	cache?: ICache,
): Router {
	const router: Router = Router();
	const manager = new TenantManager(
		tenantRepository,
		baseOrderUrl,
		defaultHistorianUrl,
		defaultInternalHistorianUrl,
		secretManager,
		fetchTenantKeyMetricInterval,
		riddlerStorageRequestMetricInterval,
		tenantKeyGenerator,
		cache,
	);

	/**
	 * Validates a tenant token. This only confirms that the token was correctly signed by the given tenant.
	 * Clients still need to verify the claims.
	 */
	router.post("/tenants/:id/validate", (request, response) => {
		const tenantId = request.params.id;
		const includeDisabledTenant = getIncludeDisabledFlag(request);
		const token = request.body.token;
		const claims = decode(token) as ITokenClaims;
		getGlobalTelemetryContext().bindProperties(
			{ tenantId, documentId: claims.documentId },
			() => {
				const validP = manager.validateToken(
					tenantId,
					request.body.token,
					includeDisabledTenant,
				);
				handleResponse(validP, response);
			},
		);
	});

	/**
	 * Signs a tenant token using the given tenant's key.
	 */
	router.post("/tenants/:id/accesstoken", (request, response) => {
		const tenantId = request.params.id;
		const scopes = request.body.scopes;
		const documentId = request.body.documentId ?? "";
		const user = request.body.user;
		const lifetime = request.body.lifetime;
		const ver = request.body.ver;
		const jti = request.body.jti;
		const accessTokenP = manager.signToken(
			tenantId,
			documentId,
			scopes,
			user,
			lifetime,
			ver,
			jti,
			getIncludeDisabledFlag(request),
		);
		handleResponse(accessTokenP, response);
	});

	/**
	 * Retrieves details for the given tenant
	 */
	router.get("/tenants/:id", (request, response) => {
		const tenantId = request.params.id;
		const includeDisabledTenant = getIncludeDisabledFlag(request);
		const tenantP = manager.getTenant(tenantId, includeDisabledTenant);
		handleResponse(tenantP, response);
	});

	/**
	 * Retrieves list of all tenants
	 */
	router.get("/tenants", (request, response) => {
		const includeDisabledTenant = getIncludeDisabledFlag(request);
		const tenantP = manager.getAllTenants(includeDisabledTenant);
		handleResponse(tenantP, response);
	});

	/**
	 * Retrieves the api key for the tenant
	 */
	router.get("/tenants/:id/keys", (request, response) => {
		const tenantId = request.params.id;
		const includeDisabledTenant = getIncludeDisabledFlag(request);
		const tenantP = manager.getTenantKeys(tenantId, includeDisabledTenant);
		handleResponse(tenantP, response);
	});

	/**
	 * Updates the storage provider for the given tenant
	 */
	router.put("/tenants/:id/storage", (request, response) => {
		const tenantId = request.params.id;
		const storageP = manager.updateStorage(tenantId, request.body);
		handleResponse(storageP, response);
	});

	/**
	 * Updates the orderer for the given tenant
	 */
	router.put("/tenants/:id/orderer", (request, response) => {
		const tenantId = request.params.id;
		const storageP = manager.updateOrderer(tenantId, request.body);
		handleResponse(storageP, response);
	});

	/**
	 * Updates the keyless access setting for the given tenant
	 */
	router.put("/tenants/:id/keyAccess", (request, response) => {
		const tenantId = request.params.id;
		const enablePrivateKeyAccess = request.body.enablePrivateKeyAccess ?? false;
		const enableSharedKeyAccess = request.body.enableSharedKeyAccess ?? true;
		const storageP = manager.updateKeyAccessPolicy(
			tenantId,
			enablePrivateKeyAccess,
			enableSharedKeyAccess,
		);
		handleResponse(storageP, response);
	});

	/**
	 * Updates the customData for the given tenant
	 */
	router.put("/tenants/:id/customData", (request, response) => {
		const tenantId = request.params.id;
		const customDataP = manager.updateCustomData(tenantId, request.body);
		handleResponse(customDataP, response);
	});

	/**
	 * Refreshes the key for the given tenant. Private keys are refreshed only if refreshPrivateKey is true.
	 * Private keys are refreshed only by internal service calls.
	 */
	router.put("/tenants/:id/key", (request, response) => {
		const tenantId = request.params.id;
		const keyName = request.body.keyName as string;
		const refreshPrivateKey = request.body.refreshPrivateKey as boolean;
		const refreshKeyP = manager.refreshTenantKey(tenantId, keyName, refreshPrivateKey);
		handleResponse(refreshKeyP, response);
	});

	/**
	 * Creates a new tenant
	 */
	router.post("/tenants/:id?", (request, response) => {
		const tenantId = request.params.id ?? getRandomName("-");
		const tenantStorage: ITenantStorage = request.body.storage ? request.body.storage : null;
		const tenantOrderer: ITenantOrderer = request.body.orderer ? request.body.orderer : null;
		const tenantCustomData: ITenantCustomData = request.body.customData
			? request.body.customData
			: {};
		const enablePrivateKeyAccess = request.body.enablePrivateKeyAccess ?? false;
		const enableSharedKeyAccess = request.body.enableSharedKeyAccess ?? true;
		const tenantP = manager.createTenant(
			tenantId,
			tenantStorage,
			tenantOrderer,
			tenantCustomData,
			enableSharedKeyAccess,
			enablePrivateKeyAccess,
		);
		handleResponse(tenantP, response);
	});

	/**
	 * Deletes a tenant
	 */
	router.delete("/tenants/:id", (request, response) => {
		const tenantId = request.params.id;
		const scheduledDeletionTimeStr = request.body.scheduledDeletionTime;
		const scheduledDeletionTime = scheduledDeletionTimeStr
			? new Date(scheduledDeletionTimeStr)
			: undefined;
		const tenantP = manager.deleteTenant(tenantId, scheduledDeletionTime);
		handleResponse(tenantP, response);
	});

	function getIncludeDisabledFlag(request): boolean {
		const includeDisabledRaw = request.query.includeDisabledTenant as string;
		return includeDisabledRaw?.toLowerCase() === "true";
	}

	return router;
}
