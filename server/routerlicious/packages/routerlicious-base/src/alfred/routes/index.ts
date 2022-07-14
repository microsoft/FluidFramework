/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDeltaService,
    IDocumentStorage,
    IProducer,
    ITenantManager,
    IThrottler,
    ICache,
    ICollection,
    IDocument,
} from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import * as api from "./api";

export interface IRoutes {
    agent: Router;
    api: Router;
}

export function create(
    config: Provider,
    tenantManager: ITenantManager,
    throttler: IThrottler,
    singleUseTokenCache: ICache,
    deltaService: IDeltaService,
    storage: IDocumentStorage,
    producer: IProducer,
    appTenants: IAlfredTenant[],
    documentsCollection: ICollection<IDocument>) {
    return {
        api: api.create(
            config,
            tenantManager,
            throttler,
            singleUseTokenCache,
            storage,
            deltaService,
            producer,
            appTenants,
            documentsCollection,
        ),
    };
}
