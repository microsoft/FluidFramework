/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import express from "express";
import nconf from "nconf";
import WebpackDevServer from "webpack-dev-server";
import {
    getMicrosoftConfiguration,
    OdspTokenManager,
    odspTokensCache,
    OdspTokenConfig,
} from "@fluidframework/tool-utils";
import { IFluidPackage } from "@fluidframework/core-interfaces";
import { IOdspTokens, getServer } from "@fluidframework/odsp-doclib-utils";
import Axios from "axios";
import { RouteOptions } from "./loader";
import { createManifestResponse } from "./bohemiaIntercept";
import { tinyliciousUrls } from "./multiResolver";

const tokenManager = new OdspTokenManager(odspTokensCache);
let odspAuthStage = 0;
let odspAuthLock: Promise<void> | undefined;

const getThisOrigin = (options: RouteOptions): string => `http://localhost:${options.port}`;

export const before = async (app: express.Application) => {
    app.get("/getclientsidewebparts", async (req, res) => res.send(await createManifestResponse()));
    app.get("/", (req, res) => res.redirect(`/new`));
};

export const after = (app: express.Application, server: WebpackDevServer, baseDir: string, env: RouteOptions) => {
    const options: RouteOptions = { mode: "local", ...env, ...{ port: server.options.port } };
    const config: nconf.Provider = nconf.env("__").file(path.join(baseDir, "config.json"));
    const buildTokenConfig = (response, redirectUriCallback?): OdspTokenConfig => ({
        type: "browserLogin",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        navigator: (url: string) => response.redirect(url),
        redirectUriCallback,
    });

    // Check that tinylicious is running when it is selected
    switch (options.mode) {
        case "docker": {
            // Include Docker Check
            break;
        }
        case "tinylicious": {
            Axios.get(tinyliciousUrls.hostUrl).then().catch((err) => {
                throw new Error(`

                You're running the Webpack-Fluid-Loader with Tinylicious.
                Tinylicious isn't running. Start the Fluid Framework Tinylicious server.
                `);
            });
            break;
        }
        default: {
            break;
        }
    }

    if (options.mode === "docker" || options.mode === "r11s" || options.mode === "tinylicious") {
        options.bearerSecret = options.bearerSecret || config.get("fluid:webpack:bearerSecret");
        if (options.mode !== "tinylicious") {
            options.tenantId = options.tenantId || config.get("fluid:webpack:tenantId") || "fluid";
            if (options.mode === "docker") {
                options.tenantSecret = options.tenantSecret
                    || config.get("fluid:webpack:docker:tenantSecret")
                    || "create-new-tenants-if-going-to-production";
            } else {
                options.tenantSecret = options.tenantSecret || config.get("fluid:webpack:tenantSecret");
            }
            if (options.mode === "r11s") {
                options.fluidHost = options.fluidHost || config.get("fluid:webpack:fluidHost");
            }
        }
    }

    options.npm = options.npm || config.get("fluid:webpack:npm");

    console.log(options);

    if (options.mode === "r11s" && !(options.tenantId && options.tenantSecret)) {
        throw new Error("You must provide a tenantId and tenantSecret to connect to a live routerlicious server");
    }

    let readyP: ((req: express.Request, res: express.Response) => Promise<boolean>) | undefined;
    if (options.mode === "spo-df" || options.mode === "spo") {
        if (!options.forceReauth && options.odspAccessToken) {
            odspAuthStage = options.pushAccessToken ? 2 : 1;
        }
        readyP = async (req: express.Request, res: express.Response) => {
            if (req.url === "/favicon.ico") {
                // ignore these
                return false;
            }

            while (odspAuthLock !== undefined) {
                await odspAuthLock;
            }
            let lockResolver: () => void;
            odspAuthLock = new Promise((resolve) => {
                lockResolver = () => {
                    resolve();
                    odspAuthLock = undefined;
                };
            });
            try {
                const originalUrl = `${getThisOrigin(options)}${req.url}`;
                if (odspAuthStage >= 2) {
                    if (!options.odspAccessToken || !options.pushAccessToken) {
                        throw Error("Failed to authenticate.");
                    }
                    return true;
                }

                options.server = getServer(options.mode);

                if (odspAuthStage === 0) {
                    await tokenManager.getOdspTokens(
                        options.server,
                        getMicrosoftConfiguration(),
                        buildTokenConfig(res, async (tokens: IOdspTokens) => {
                            options.odspAccessToken = tokens.accessToken;
                            return originalUrl;
                        }),
                        true /* forceRefresh */,
                        options.forceReauth,
                    );
                    odspAuthStage = 1;
                    return false;
                }
                await tokenManager.getPushTokens(
                    options.server,
                    getMicrosoftConfiguration(),
                    buildTokenConfig(res, async (tokens: IOdspTokens) => {
                        options.pushAccessToken = tokens.accessToken;
                        return originalUrl;
                    }),
                    true /* forceRefresh */,
                    options.forceReauth,
                );
                odspAuthStage = 2;
                return false;
            } finally {
                lockResolver();
            }
        };
    }

    app.get("/odspLogin", async (req, res) => {
        if (options.mode !== "spo-df" && options.mode !== "spo") {
            res.write("Mode must be spo or spo-df to login to ODSP.");
            res.end();
            return;
        }
        await tokenManager.getOdspTokens(
            options.server,
            getMicrosoftConfiguration(),
            buildTokenConfig(res, async (tokens: IOdspTokens) => {
                options.odspAccessToken = tokens.accessToken;
                return `${getThisOrigin(options)}/pushLogin`;
            }),
            undefined /* forceRefresh */,
            true /* forceReauth */,
        );
    });

    app.get("/pushLogin", async (req, res) => {
        if (options.mode !== "spo-df" && options.mode !== "spo") {
            res.write("Mode must be spo or spo-df to login to Push.");
            res.end();
            return;
        }
        options.pushAccessToken = (await tokenManager.getPushTokens(
            options.server,
            getMicrosoftConfiguration(),
            buildTokenConfig(res),
            undefined /* forceRefresh */,
            true /* forceReauth */,
        )).accessToken;
    });

    app.get("/file*", (req, res) => {
        const buffer = fs.readFileSync(req.params[0].substr(1));
        res.end(buffer);
    });

    const isReady = async (req, res) => {
        if (readyP !== undefined) {
            let canContinue = false;
            try {
                canContinue = await readyP(req, res);
            } catch (error) {
                let toLog = error;
                try {
                    toLog = JSON.stringify(error);
                } catch { }
                console.log(toLog);
            }
            if (!canContinue) {
                if (!res.finished) {
                    res.end();
                }
                return false;
            }
        }

        return true;
    };

    /**
     * For urls of format - http://localhost:8080/doc/<id>.
     * This is when user is trying to load an existing document. We try to load a Container with `id` as documentId.
     */
    app.get("/doc/:id*", async (req, res) => {
        const ready = await isReady(req, res);
        if (ready) {
            fluid(req, res, baseDir, options);
        }
    });

    /**
     * For urls of format - http://localhost:8080/<id>.
     * If the `id` is "new" or "manualAttach", the user is trying to create a new document.
     * For other `ids`, we treat this as the user trying to load an existing document. We redirect to
     * http://localhost:8080/doc/<id>.
     */
    app.get("/:id*", async (req, res) => {
        // Ignore favicon.ico urls.
        if (req.url === "/favicon.ico") {
            res.end();
            return;
        }

        const documentId = req.params.id;
        // For testing orderer, we use the path: http://localhost:8080/testorderer. This will use the local storage
        // instead of using actual storage service to which the connection is made. This will enable testing
        // orderer even if the blob storage services are down.
        if (documentId !== "new" && documentId !== "manualAttach" && documentId !== "testorderer") {
            // The `id` is not for a new document. We assume the user is trying to load an existing document and
            // redirect them to - http://localhost:8080/doc/<id>.
            const reqUrl = req.url.replace(documentId, `doc/${documentId}`);
            const newUrl = `${getThisOrigin(options)}${reqUrl}`;
            res.redirect(newUrl);
            return;
        }

        const ready = await isReady(req, res);
        if (ready) {
            fluid(req, res, baseDir, options);
        }
    });
};

const fluid = (req: express.Request, res: express.Response, baseDir: string, options: RouteOptions) => {
    const documentId = req.params.id;
    // eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
    const packageJson = require(path.join(baseDir, "./package.json")) as IFluidPackage;

    const html =
        `<!DOCTYPE html>
<html style="height: 100%;" lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentId}</title>
</head>
<body style="margin: 0; height: 100%;">
    <div id="content" style="min-height: 100%;">
    </div>

    <script src="/node_modules/@fluidframework/webpack-fluid-loader/dist/fluid-loader.bundle.js"></script>
    ${packageJson.fluid.browser.umd.files.map((file) => `<script src="/${file}"></script>\n`)}
    <script>
        var pkgJson = ${JSON.stringify(packageJson)};
        var options = ${JSON.stringify(options)};
        var fluidStarted = false;
        FluidLoader.start(
            "${documentId}",
            pkgJson,
            window["${packageJson.fluid.browser.umd.library}"],
            options,
            document.getElementById("content"))
        .then(() => fluidStarted = true)
        .catch((error) => console.error(error));
    </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.end(html);
};
