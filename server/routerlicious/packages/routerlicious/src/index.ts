/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import * as alfredUtils from "./alfred/utils";
import * as alfredApp from "./alfred/app";
import * as alfredRoutes from "./alfred/routes";
import * as alfredApi from "./alfred/routes/api";
import * as riddlerApp from "./riddler/app";
import * as riddlerApi from "./riddler/api";

// Alfred
export * from "./alfred/runnerFactory";
export * from "./alfred/runner";
export const alfred = {
    app: alfredApp,
    routes: alfredRoutes,
    api: alfredApi,
    utils: alfredUtils,
};

// Riddler
export * from "./riddler/runnerFactory";
export * from "./riddler/runner";
export * from "./riddler/tenantManager";
export const riddler = {
    app: riddlerApp,
    api: riddlerApi,
};
