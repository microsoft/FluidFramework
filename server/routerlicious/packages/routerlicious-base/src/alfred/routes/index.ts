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
} from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
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
	tokenRevocationManager?: ITokenRevocationManager,
	revokedTokenChecker?: IRevokedTokenChecker,
	collaborationSessionEventEmitter?: TypedEventEmitter<ICollaborationSessionEvents>,
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
			tokenRevocationManager,
			revokedTokenChecker,
			collaborationSessionEventEmitter,
		),
	};
}
