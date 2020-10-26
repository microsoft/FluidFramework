/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 } from "uuid";
import dotenv from "dotenv";
import winston from "winston";
import { IFluidResolvedUrl } from "@fluidframework/driver-definitions";
import { IFluidCodeDetails, IResolvedFluidCodeDetails } from "@fluidframework/container-definitions";
import { extractPackageIdentifierDetails, SemVerCdnCodeResolver } from "@fluidframework/web-code-loader";
import {
    getSpoPushServer,
    getSpoServer,
    isSpoPushServer,
    isSpoServer,
} from "./odspUtils";
import { FullTree } from "./gatewayUrlResolver";
import { ICachedPackage } from "./utils";

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

export async function getSpfxFluidObjectData(resolved: IFluidResolvedUrl): Promise<any> {
    const queryUrl = new URL(`https://${process.env.SP_SITE}`);
    queryUrl.pathname = `${queryUrl.pathname}/_api/web/getclientsidewebparts`;
    const response = await fetch(`${queryUrl}`, {
        method: "GET",
        headers: {
            Accept: "application/json;odata=verbose",
            Authorization: `Bearer ${resolved.tokens.storageToken}`,
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

export function getFluidObjectBundle(
    requestUrl: string,
    resolvedP: Promise<IFluidResolvedUrl>,
    fullTreeP: Promise<FullTree | undefined>,
    codeResolver: SemVerCdnCodeResolver,
    chaincode: string,
    cdn: string,
    entrypoint: string,
): [Promise<IResolvedFluidCodeDetails | IFluidCodeDetails | undefined>, Promise<ICachedPackage>] {
    let scriptsP: Promise<ICachedPackage>;
    let pkgP: Promise<IResolvedFluidCodeDetails | IFluidCodeDetails>;
    if (requestUrl.indexOf("spo-custom") >= 0) {
        scriptsP = resolvedP
            .then(async (resolved) => getSpfxFluidObjectData(resolved))
            .then((manifest) => {
                const baseUrl = manifest.loaderConfig.internalModuleBaseUrls[0] ?? "";
                const scriptResources = manifest.loaderConfig.scriptResources[
                    `fluid.${manifest.loaderConfig.entryModuleId}`
                ] ?? "";
                const bundle = scriptResources.path;
                return {
                    entrypoint: manifest.loaderConfig.entryModuleId,
                    scripts: [
                        {
                            id: baseUrl,
                            url: `${baseUrl}/${bundle}`,
                        },
                    ],
                };
            });

        pkgP = scriptsP.then((scripts) => {
            const name = `@gateway/${v4()}`;
            const bundle = {
                browser: {
                    umd: {
                        files: [scripts.scripts[0].url],
                        library: scripts.entrypoint,
                    },
                },
            };
            const fluidPackage = {
                fluid: bundle,
                name,
                version: "0.0.0",
            };
            return {
                resolvedPackage: fluidPackage,
                package: fluidPackage,
                config: {
                    [`@gateway:cdn`]: scripts.scripts[0].url,
                },
                fluid: bundle,
                name,
                version: "0.0.0",
            };
        });
    } else {
        pkgP = fullTreeP.then(async (fullTree) => {
            if (fullTree && fullTree.code) {
                return codeResolver.resolveCodeDetails(fullTree.code);
            }

            if (chaincode === undefined) {
                throw Error("No pkg was returned");
            }

            let codeDetails: IFluidCodeDetails;
            if (chaincode.startsWith("http")) {
                codeDetails = {
                    config: {
                        [`@gateway:cdn`]: chaincode,
                    },
                    package: {
                        fluid: {
                            browser: {
                                umd: {
                                    files: [chaincode],
                                    library: entrypoint,
                                },
                            },
                        },
                        name: `@gateway/${v4()}`,
                        version: "0.0.0",
                    },
                };
            } else {
                const details = extractPackageIdentifierDetails(chaincode);
                codeDetails = {
                    config: {
                        [`@${details.scope}:cdn`]: cdn,
                    },
                    package: chaincode,
                };
            }

            return codeResolver.resolveCodeDetails(codeDetails);
        });

        scriptsP = pkgP.then((pkg) => {
            if (pkg === undefined) {
                throw Error("No pkg was returned");
            }

            const umd = (pkg as IResolvedFluidCodeDetails).resolvedPackage.fluid?.browser?.umd;
            if (umd === undefined) {
                throw Error("No UMD details were found in the package");
            }

            const scripts: ICachedPackage = {
                entrypoint: umd.library,
                scripts: umd.files.map(
                    (url, index) => {
                        return {
                            id: `${(pkg as IResolvedFluidCodeDetails).resolvedPackageCacheId}-${index}`,
                            url,
                        };
                    }),
            };
            return scripts;
        });
    }

    return [pkgP, scriptsP];
}
