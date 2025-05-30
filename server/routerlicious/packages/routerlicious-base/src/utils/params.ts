/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getParam } from "@fluidframework/server-services-utils";
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";

const getParamFromRequest = (params: Params, paramName: string) =>
	getParam(params, paramName) ?? "-";
/**
 * @internal
 */
export const getIdFromRequest = (params: Params) => getParamFromRequest(params, "id");
/**
 * @internal
 */
export const getTenantIdFromRequest = (params: Params) =>
	getParam(params, "tenantId") ?? getIdFromRequest(params);
