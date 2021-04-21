/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { getParam } from "@fluidframework/server-services-utils";

export function getTenantIdFromRequest(params: Params) {
    const tenantId = getParam(params, "tenantId");
    if (tenantId !== undefined) {
        return tenantId;
    }
    const id = getParam(params, "id");
    if (id !== undefined) {
        return id;
    }

    return "-";
}
