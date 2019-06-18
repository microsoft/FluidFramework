/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Router } from "express";
import * as nconf from "nconf";
import * as contents from "./contents";

export interface IRoutes {
    files: Router;
}

export function create(store: nconf.Provider): IRoutes {
    return {
        files: contents.create(store),
    };
}
