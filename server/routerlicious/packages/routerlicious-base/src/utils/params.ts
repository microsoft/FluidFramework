/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { getParam } from "@fluidframework/server-services-utils";

const getParamFromRequest = (params: Params, paramName: string) => getParam(params, paramName) ?? "-";
export const getIdFromRequest = (params: Params) => getParamFromRequest(params, "id");
export const getTenantIdFromRequest = (params: Params) => getParam(params, "tenantId") ?? getIdFromRequest(params);
