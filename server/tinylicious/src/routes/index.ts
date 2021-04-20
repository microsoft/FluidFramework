/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorage,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Router } from "express";
import { Provider } from "nconf";
import * as ordering from "./ordering";
import * as storage from "./storage";

export interface IRoutes {
    ordering: Router;
    storage: Router;
}

export function create(
    config: Provider,
    mongoManager: MongoManager,
    documentStorage: IDocumentStorage,
) {
    return {
        ordering: ordering.create(config, documentStorage, mongoManager),
        storage: storage.create(config),
    };
}
