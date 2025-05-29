/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IAlfredTenant } from "@fluidframework/server-services-client";
import {
	IDeltaService,
	IDocumentStorage,
	IProducer,
	ITenantManager,
	IThrottler,
	ICache,
	IDocumentRepository,
	ITokenRevocationManager,
	IRevokedTokenChecker,
	IClusterDrainingChecker,
	IFluidAccessTokenGenerator,
	IReadinessCheck,
	type IDenyList,
} from "@fluidframework/server-services-core";
import type { Emitter as RedisEmitter } from "@socket.io/redis-emitter";
import { Router } from "express";
import { Provider } from "nconf";

import { IDocumentDeleteService } from "../services";

import * as api from "./api";

export interface IRoutes {
	agent: Router;
	api: Router;
}

export function create(
	config: Provider,
	tenantManager: ITenantManager,
	tenantThrottlers: Map<string, IThrottler>,
	clusterThrottlers: Map<string, IThrottler>,
	singleUseTokenCache: ICache,
	deltaService: IDeltaService,
	storage: IDocumentStorage,
	producer: IProducer,
	appTenants: IAlfredTenant[],
	documentRepository: IDocumentRepository,
	documentDeleteService: IDocumentDeleteService,
	startupCheck: IReadinessCheck,
	tokenRevocationManager?: ITokenRevocationManager,
	revokedTokenChecker?: IRevokedTokenChecker,
	collaborationSessionEventEmitter?: RedisEmitter,
	clusterDrainingChecker?: IClusterDrainingChecker,
	readinessCheck?: IReadinessCheck,
	fluidAccessTokenGenerator?: IFluidAccessTokenGenerator,
	redisCacheForGetSession?: ICache,
	denyList?: IDenyList,
) {
	return {
		api: api.create(
			config,
			tenantManager,
			tenantThrottlers,
			clusterThrottlers,
			singleUseTokenCache,
			storage,
			deltaService,
			producer,
			appTenants,
			documentRepository,
			documentDeleteService,
			startupCheck,
			tokenRevocationManager,
			revokedTokenChecker,
			collaborationSessionEventEmitter,
			clusterDrainingChecker,
			readinessCheck,
			fluidAccessTokenGenerator,
			redisCacheForGetSession,
			denyList,
		),
	};
}
