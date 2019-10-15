/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    getSpoPushServer,
    getSpoServer,
    isSpoPushServer,
    isSpoServer,
    isSpoTenant,
} from "@fluid-example/tiny-web-host";
import { URL } from "url";

export function saveSpoTokens(req, params, accessToken: string, refreshToken: string) {
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

export function spoEnsureLoggedIn() {
    return (req, res, next) => {
        const tenantId = req.params.tenantId;
        if (isSpoTenant(tenantId)) {
            if (!req.session
                || !req.session.tokens
                || !req.session.tokens[getSpoServer(tenantId)]
                || !req.session.tokens[getSpoServer(tenantId)].accessToken) {

                req.session.returnTo = req.originalUrl || req.url;
                return res.redirect(`/login_${req.params.tenantId}`);
            }

            if (!req.session.tokens[getSpoPushServer()]) {
                req.session.returnTo = req.originalUrl || req.url;
                return res.redirect(`/login_pushsrv`);
            }
        }
        next();
    };
}
