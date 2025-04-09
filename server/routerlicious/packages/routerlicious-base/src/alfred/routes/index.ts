/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
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
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant, NetworkError } from "@fluidframework/server-services-client";
import { IDocumentDeleteService } from "../services";
import * as api from "./api";
import { handleResponse } from "@fluidframework/server-services-shared";
import type { Response } from "express";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

export interface IRoutes {
	agent: Router;
	api: Router;
}

export function handleDenyListResponse(
	tenantId: string,
	documentId: string,
	denyList: IDenyList,
	response: Response,
) {
	if (denyList?.isDenied(tenantId, documentId)) {
		Lumberjack.error("Document is in the deny list", {
			tenantId,
			documentId,
		});
		handleResponse(
			Promise.reject(
				new NetworkError(500, `Unable to process request for document id: ${documentId}`),
			),
			response,
		);
	}
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
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
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
