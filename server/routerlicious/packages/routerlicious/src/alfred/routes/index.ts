/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorage,
    IProducer,
    ITenantManager,
    MongoManager,
} from "@microsoft/fluid-server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import { IAlfredTenant } from "@microsoft/fluid-server-services-client";
import agent from "./agent";
import api from "./api";

export interface IRoutes {
    agent: Router;
    api: Router;
}

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function create(
    config: Provider,
    tenantManager: ITenantManager,
    mongoManager: MongoManager,
    storage: IDocumentStorage,
    producer: IProducer,
    appTenants: IAlfredTenant[]) {
    return {
        api: api.create(config, tenantManager, storage, mongoManager, producer, appTenants),
    };
}
