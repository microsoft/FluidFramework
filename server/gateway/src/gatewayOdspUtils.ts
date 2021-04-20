/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getSpoPushServer,
    getSpoServer,
    isSpoPushServer,
    isSpoServer,
} from "./odspUtils";

export function saveSpoTokens(req, params, accessToken: string, refreshToken: string) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!req.session.tokens) {
        req.session.tokens = {};
    }
    try {
        const url = new URL(params.scope);
        if (url.protocol === "https:" && (isSpoServer(url.hostname) || isSpoPushServer(url.hostname))) {
            req.session.tokens[url.hostname] = { accessToken, refreshToken };
        }
    } catch (e) {
        // Nothing
        console.error(e);
    }
}

export const spoEnsureLoggedIn = () => {
    return (req, res, next) => {
        const tenantId = req.params.tenantId;
        const spoTenant = getSpoServer(tenantId);
        if (spoTenant !== undefined) {
            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!req.session
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                || !req.session.tokens
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                || !req.session.tokens[spoTenant]
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                || !req.session.tokens[spoTenant].accessToken) {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                req.session.returnTo = req.originalUrl || req.url;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return res.redirect(`/login_${req.params.tenantId}`);
            }

            // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
            if (!req.session.tokens[getSpoPushServer()]) {
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                req.session.returnTo = req.originalUrl || req.url;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return res.redirect(`/login_pushsrv`);
            }
        }
        next();
    };
};
