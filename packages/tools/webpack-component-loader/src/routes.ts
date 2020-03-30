/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as path from "path";
import * as express from "express";
import * as moniker from "moniker";
import * as nconf from "nconf";
import WebpackDevServer from "webpack-dev-server";
import { IOdspTokens, getServer } from "@microsoft/fluid-odsp-utils";
import { getMicrosoftConfiguration, OdspTokenManager, odspTokensCache } from "@microsoft/fluid-tool-utils";
import { RouteOptions } from "./loader";

const tokenManager = new OdspTokenManager(odspTokensCache);
let odspAuthStage = 0;
let odspAuthLock: Promise<void> | undefined;

const getThisOrigin = (options: RouteOptions): string => `http://localhost:${options.port}`;

export const before = (app: express.Application, server: WebpackDevServer) => {
    app.get("/", (req, res) => res.redirect(`/${moniker.choose()}`));
};

export const after = (app: express.Application, server: WebpackDevServer, baseDir: string, env: RouteOptions) => {
    const options: RouteOptions = { mode: "local", ...env, ...{ port: server.options.port } };
    const config: nconf.Provider = nconf.env("__").file(path.join(baseDir, "config.json"));
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
                        (url: string) => res.redirect(url),
                        async (tokens: IOdspTokens) => {
                            options.odspAccessToken = tokens.accessToken;
                            return originalUrl;
                        },
                        true,
                        options.forceReauth,
                    );
                    odspAuthStage = 1;
                    return false;
                }
                await tokenManager.getPushTokens(
                    options.server,
                    getMicrosoftConfiguration(),
                    (url: string) => res.redirect(url),
                    async (tokens: IOdspTokens) => {
                        options.pushAccessToken = tokens.accessToken;
                        return originalUrl;
                    },
                    true,
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
            (url: string) => res.redirect(url),
            async (tokens: IOdspTokens) => {
                options.odspAccessToken = tokens.accessToken;
                return `${getThisOrigin(options)}/pushLogin`;
            },
            true,
            true,
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
            (url: string) => res.redirect(url),
            undefined,
            true,
            true,
        )).accessToken;
    });
    app.get("/file*", (req, res) => {
        const buffer = fs.readFileSync(req.params[0].substr(1));
        res.end(buffer);
    });
    app.get("/create", async (req, res) => {
        if (readyP !== undefined) {
            let canContinue = false;
            try {
                canContinue = await readyP(req, res);
            } catch (error) {
                let toLog = error;
                try {
                    toLog = JSON.stringify(error);
                } catch {}
                console.log(toLog ?? error);
            }
            if (!canContinue) {
                if (!res.finished) {
                    res.end();
                }
                return;
            }
        }
        create(req, res, baseDir, options);
    });
    app.get("/:id*", async (req, res) => {
        if (readyP !== undefined) {
            let canContinue = false;
            try {
                canContinue = await readyP(req, res);
            } catch (error) {
                let toLog = error;
                try {
                    toLog = JSON.stringify(error);
                } catch {}
                console.log(toLog);
            }
            if (!canContinue) {
                if (!res.finished) {
                    res.end();
                }
                return;
            }
        }
        fluid(req, res, baseDir, options);
    });
};

const fluid = (req: express.Request, res: express.Response, baseDir: string, options: RouteOptions) => {

    const documentId = req.params.id;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const packageJson = require(path.join(baseDir, "./package.json"));

    const html =
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentId}</title>
</head>
<body style="margin: 0; padding: 0">
    <div id="content" style="width: 100%; min-height: 100vh; display: flex; position: relative">
    </div>

    <script src="/node_modules/@microsoft/fluid-webpack-component-loader/dist/fluid-loader.bundle.js"></script>
    <script>
        var pkgJson = ${JSON.stringify(packageJson)};
        var options = ${JSON.stringify(options)};
        var fluidStarted = false;
        FluidLoader.start(
            "${documentId}",
            pkgJson,
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

const create = (req: express.Request, res: express.Response, baseDir: string, options: RouteOptions) => {

    const documentId = req.params.id;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const packageJson = require(path.join(baseDir, "./package.json"));

    const html =
        `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentId}</title>
</head>
<body style="margin: 0; padding: 0">  
    <div>
        <button id="attach-button" disabled>Attach!</button>
    </div>
    <div>
        <textarea id="text" rows="1" cols="60" wrap="hard">Url will appear here!!</textarea>
    </div>
    <div id="content">
    </div>  
    <script src="/node_modules/@microsoft/fluid-webpack-component-loader/dist/fluid-loader.bundle.js"></script>
    <script>
        var pkgJson = ${JSON.stringify(packageJson)};
        var options = ${JSON.stringify(options)};
        const containerP = FluidLoader.create(
            "${documentId}",
            pkgJson,
            options,
            document.getElementById("content"));
        containerP.then(
            (container) => {
                const attachButton = document.getElementById("attach-button");
                attachButton.disabled = false;
                attachButton.onclick = () => {
                    container.attach({url: window.location.href}).then(
                        () => {
                            const textarea = document.getElementById("text");
                            textarea.innerText = window.location.href.replace("create", container.id);
                            console.log("Fully attached!");
                        },
                        (error) => {
                            console.error(error);
                        });
                }
            },
            (error) => {
                console.error(error);
            });
    </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.end(html);
};
