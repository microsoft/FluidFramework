/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import dotenv from "dotenv";
import winston from "winston";
import {
    getSpoPushServer,
    getSpoServer,
    isSpoPushServer,
    isSpoServer,
} from "./odspUtils";

dotenv.config();

export function saveSpoTokens(
    req,
    params,
    accessToken: string,
    refreshToken: string,
) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!req.session.tokens) {
        req.session.tokens = {};
    }
    try {
        const url = new URL(params.scope);
        if (
            url.protocol === "https:" &&
            (isSpoServer(url.hostname) || isSpoPushServer(url.hostname))
        ) {
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
            if (
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                !req.session ||
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                !req.session.tokens ||
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                !req.session.tokens[spoTenant] ||
                // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
                !req.session.tokens[spoTenant].accessToken
            ) {
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

export async function getSpfxFluidObjectData(): Promise<any> {
    const queryUrl = new URL(process.env.SP_SITE ?? "");
    queryUrl.pathname = `${queryUrl.pathname}/_api/web/getclientsidewebparts`;
    const response = await fetch(`${queryUrl}`, {
        method: "GET",
        headers: {
            Accept: "application/json;odata=verbose",
            Authorization: `Bearer ${process.env.SP_AUTH_TOKEN}`,
        },
    });
    const responseJsonDataResults = (await response.json()).d.GetClientSideWebParts.results;
    let fluidManifest = {};
    responseJsonDataResults.forEach((pkg) => {
        const manifest = JSON.parse(pkg.Manifest);
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        if (manifest.experimentalData && manifest.experimentalData.fluid) {
            winston.info(JSON.stringify("woot"));
            winston.info(JSON.stringify(manifest));
            fluidManifest = manifest;
        }
    });
    return fluidManifest;
}
