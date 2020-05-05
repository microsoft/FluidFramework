/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as nconf from "nconf";
import * as contents from "./contents";

/**
 * Provides access to router for npm package files.
 */
export interface IRoutes {
    files: Router;
}

/**
 * Creates and configures a router accessor for npm package files.
 * @param store - config store for router
 */
export function create(store: nconf.Provider): IRoutes {
    return {
        files: contents.create(store),
    };
}
