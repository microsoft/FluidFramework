/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTokenClaims, ITokenClaims } from "@fluidframework/protocol-definitions";
import { canSummarize } from "@fluidframework/server-services-client";
import { Router } from "express";
import safeStringify from "json-stringify-safe";
import jwt from "jsonwebtoken";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import passport = require("passport");
import { IAlfred } from "../interfaces";

interface ISummaryTokenRequest {
    actorClientId: string;
    grantType: string;
    issuerClientId: string;
    issuerToken: string;
}

export function create(alfred: IAlfred): Router {
    const router: Router = Router();
    const tenantManager = alfred.getTenantManager();

    /**
     * Experimental: Grants summary permission to a client.
     * Based on https://tools.ietf.org/html/draft-ietf-oauth-token-exchange-18
     */
    router.post("/summary", passport.authenticate("jwt", { session: false }), async (request, response) => {
        const tokenRequest = request.body as ISummaryTokenRequest;
        const token = tokenRequest.issuerToken;
        const claims = jwt.decode(token) as ITokenClaims;
        if (!canSummarize(claims.scopes)) {
            response.status(400).end("No summary claim is found");
        } else {
            const verifyP = tenantManager.verifyToken(claims.tenantId, token);
            const keyP = tenantManager.getKey(claims.tenantId);
            Promise.all([verifyP, keyP]).then(([, key]) => {
                // It's probably okay to copy over the original claims for now.
                const newClaims: ISummaryTokenClaims = {
                    act: {
                        sub: tokenRequest.actorClientId,
                    },
                    claims,
                    sub: tokenRequest.issuerClientId,
                };
                const newToken = jwt.sign(newClaims, key);
                response.status(200).json(newToken);
            }, (error) => {
                response.status(400).end(safeStringify(error));
            });
        }
    });

    return router;
}
