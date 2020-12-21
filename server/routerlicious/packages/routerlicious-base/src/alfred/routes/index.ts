/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorage,
    IProducer,
    ITenantManager,
    MongoManager,
    IThrottler,
} from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import * as api from "./api";

export interface IRoutes {
    agent: Router;
    api: Router;
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function create(
    config: Provider,
    tenantManager: ITenantManager,
    throttler: IThrottler,
    mongoManager: MongoManager,
    storage: IDocumentStorage,
    producer: IProducer,
    appTenants: IAlfredTenant[]) {
    return {
        api: api.create(config, tenantManager, throttler, storage, mongoManager, producer, appTenants),
    };
}
