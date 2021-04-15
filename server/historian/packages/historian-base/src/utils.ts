/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// In this case we want @types/express-serve-static-core, not express-serve-static-core, and so disable the lint rule
// eslint-disable-next-line import/no-unresolved
import { Params } from "express-serve-static-core";
import { getParam } from "@fluidframework/server-services-utils";
import { ITokenClaims } from "@fluidframework/protocol-definitions";
import * as jwt from "jsonwebtoken";

export function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // named pipe
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return val;
    }

    if (normalizedPort >= 0) {
        // port number
        return normalizedPort;
    }

    return false;
}

export function getTokenLifetimeInSec(token: string): number {
    const claims = jwt.decode(token) as ITokenClaims;
    if (claims && claims.exp) {
        return (claims.exp - Math.round((new Date().getTime()) / 1000));
    }
    return undefined;
}

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
