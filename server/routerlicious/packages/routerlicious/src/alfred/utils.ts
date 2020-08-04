/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";

// eslint-disable-next-line prefer-arrow/prefer-arrow-functions
export function getParam(params: Params, key: string) {
    return Array.isArray(params) ? undefined : params[key];
}

export function getTenantIdFromRequest(params: Params) {
    if (getParam(params, "tenantId") !== undefined) {
        return getParam(params, "tenantId");
    }
    if (getParam(params, "id") !== undefined) {
        return getParam(params, "id");
    }

    return "-";
}
