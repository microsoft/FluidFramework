/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
} from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { IDocumentDeleteService } from "../../services";
import * as api from "./api";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
	config: Provider,
	tenantManager: ITenantManager,
	tenantGroupMap: Map<string, string>,
	throttlersMap: Map<string, Map<string, IThrottler>>,
	singleUseTokenCache: ICache,
	storage: IDocumentStorage,
	deltaService: IDeltaService,
	producer: IProducer,
	appTenants: IAlfredTenant[],
	documentRepository: IDocumentRepository,
	documentDeleteService: IDocumentDeleteService,
	tokenRevocationManager?: ITokenRevocationManager,
	revokedTokenChecker?: IRevokedTokenChecker,
): Router {
	const router: Router = Router();
	const deltasRoute = deltas.create(
		config,
		tenantManager,
		deltaService,
		appTenants,
		tenantGroupMap,
		throttlersMap,
		singleUseTokenCache,
		revokedTokenChecker,
	);
	const documentsRoute = documents.create(
		storage,
		appTenants,
		tenantGroupMap,
		throttlersMap,
		singleUseTokenCache,
		config,
		tenantManager,
		documentRepository,
		documentDeleteService,
		tokenRevocationManager,
		revokedTokenChecker,
	);
	const apiRoute = api.create(
		config,
		producer,
		tenantManager,
		storage,
		throttlersMap,
		singleUseTokenCache,
		revokedTokenChecker,
	);

	router.use(cors());
	router.use("/deltas", deltasRoute);
	router.use("/documents", documentsRoute);
	router.use("/api/v1", apiRoute);

	return router;
}
