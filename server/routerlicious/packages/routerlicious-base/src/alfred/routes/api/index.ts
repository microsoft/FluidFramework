/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICache,
	ICollection,
	IDeltaService,
	IDocument,
	IDocumentStorage,
	IProducer,
	ITenantManager,
	IThrottler,
	ITokenRevocationManager,
} from "@fluidframework/server-services-core";
import cors from "cors";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import * as api from "./api";
import * as deltas from "./deltas";
import * as documents from "./documents";

export function create(
	config: Provider,
	tenantManager: ITenantManager,
	tenantThrottler: IThrottler,
	clusterThrottlers: Map<string, IThrottler>,
	singleUseTokenCache: ICache,
	storage: IDocumentStorage,
	deltaService: IDeltaService,
	producer: IProducer,
	appTenants: IAlfredTenant[],
	documentsCollection: ICollection<IDocument>,
	tokenManager?: ITokenRevocationManager,
): Router {
	const router: Router = Router();
	const deltasRoute = deltas.create(
		config,
		tenantManager,
		deltaService,
		appTenants,
		tenantThrottler,
		clusterThrottlers,
		tokenManager,
	);
	const documentsRoute = documents.create(
		storage,
		appTenants,
		tenantThrottler,
		clusterThrottlers,
		singleUseTokenCache,
		config,
		tenantManager,
		documentsCollection,
		tokenManager,
	);
	const apiRoute = api.create(
		config,
		producer,
		tenantManager,
		storage,
		tenantThrottler,
		tokenManager,
	);

	router.use(cors());
	router.use("/deltas", deltasRoute);
	router.use("/documents", documentsRoute);
	router.use("/api/v1", apiRoute);

	return router;
}
