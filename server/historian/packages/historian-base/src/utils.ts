/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims } from "@fluidframework/protocol-definitions";
import { getCorrelationId } from "@fluidframework/server-services-utils";
import * as jwt from "jsonwebtoken";

export function normalizePort(val) {
    const normalizedPort = parseInt(val, 10);

    if (isNaN(normalizedPort)) {
        // named pipe
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

export function getCommonMessageMetaData() {
    const correlationId = getCorrelationId();
    return correlationId ? { correlationId } : undefined;
}
