/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	ICache,
	IDeltaService,
	IDocumentRepository,
	IDocumentStorage,
	IProducer,
	IRevokedTokenChecker,
	ITenantManager,
	IThrottler,
	ITokenRevocationManager,
	IClusterDrainingChecker,
	IFluidAccessTokenGenerator,
	IReadinessCheck,
} from "@fluidframework/server-services-core";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { IDocumentDeleteService } from "../../services";
import * as api from "./api";
import * as deltas from "./deltas";
import * as documents from "./documents";
import { createHealthCheckEndpoints } from "@fluidframework/server-services-shared";

export function create(
	config: Provider,
	tenantManager: ITenantManager,
	tenantThrottlers: Map<string, IThrottler>,
	clusterThrottlers: Map<string, IThrottler>,
	singleUseTokenCache: ICache,
	storage: IDocumentStorage,
	deltaService: IDeltaService,
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
): Router {
	const router: Router = Router();
	const deltasRoute = deltas.create(
		config,
		tenantManager,
		deltaService,
		appTenants,
		tenantThrottlers,
		clusterThrottlers,
		singleUseTokenCache,
		revokedTokenChecker,
	);
	const documentsRoute = documents.create(
		storage,
		appTenants,
		tenantThrottlers,
		clusterThrottlers,
		singleUseTokenCache,
		config,
		tenantManager,
		documentRepository,
		documentDeleteService,
		tokenRevocationManager,
		revokedTokenChecker,
		clusterDrainingChecker,
	);
	const apiRoute = api.create(
		config,
		producer,
		tenantManager,
		storage,
		tenantThrottlers,
		singleUseTokenCache,
		revokedTokenChecker,
		collaborationSessionEventEmitter,
		fluidAccessTokenGenerator,
	);

	const healthCheckEndpoints = createHealthCheckEndpoints(
		"alfred",
		startupCheck,
		readinessCheck,
		false /* createLivenessEndpoint */,
	);

	router.use(cors());
	router.use("/deltas", deltasRoute);
	router.use("/documents", documentsRoute);
	router.use("/api/v1", apiRoute);
	router.use("/healthz", healthCheckEndpoints);

	return router;
}
