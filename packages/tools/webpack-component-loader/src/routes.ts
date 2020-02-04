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
import { IOdspTokens } from "@microsoft/fluid-odsp-utils";
import { IRouteOptions } from "./loader";
import { OdspTokenManager, createRedirector } from "./odspTokenManager";
import { OdspUrlResolver } from "./odspUrlResolver";

export const before = (app: express.Application, server: WebpackDevServer) => {
    app.get("/", (req, res) => res.redirect(`/${moniker.choose()}`));
};

export const after = (app: express.Application, server: WebpackDevServer, baseDir: string, env: IRouteOptions) => {
    const options: IRouteOptions = { mode: "local", ...env, ...{ port: server.options.port } };
    const config: nconf.Provider = nconf.env("__").file(path.join(baseDir, "config.json"));
    options.fluidHost = options.fluidHost ? options.fluidHost : config.get("fluid:webpack:fluidHost");
    options.tenantId = options.tenantId ? options.tenantId : config.get("fluid:webpack:tenantId");
    options.tenantSecret = options.tenantSecret ? options.tenantSecret : config.get("fluid:webpack:tenantSecret");
    options.bearerSecret = options.bearerSecret ? options.bearerSecret : config.get("fluid:webpack:bearerSecret");
    options.npm = options.npm ? options.npm : config.get("fluid:webpack:npm");

    console.log(options);

    if (options.mode === "r11s" && !(options.tenantId && options.tenantSecret)) {
        throw new Error("You must provide a tenantId and tenantSecret to connect to a live routerlicious server");
    } else if ((options.tenantId || options.tenantSecret) && !(options.tenantId && options.tenantSecret)) {
        throw new Error("tenantId and tenantSecret must be provided together");
    }

    let readyP: ((req: express.Request, res: express.Response) => Promise<boolean>) | undefined;
    if (options.mode === "spo-df" && !options.odspAccessToken) {
        readyP = async (req: express.Request, res: express.Response) => {
            if (req.url === "/favicon.ico") {
                // ignore these
                return false;
            }
            const originalUrl = `http://localhost:${options.port}${req.url}`;
            if (options.odspAccessToken) {
                // force creation of file if not already exists
                const odspUrlResolver = new OdspUrlResolver(
                    options.odspServer,
                    options.odspClientConfig,
                    options.odspAccessToken);
                await odspUrlResolver.resolve({ url: originalUrl });
                return true;
            }

            const tokenManager = new OdspTokenManager(createRedirector(res));
            options.odspServer = tokenManager.getServer("spo-df"); // could forward options.mode
            options.odspClientConfig = tokenManager.getMicrosoftConfiguration();

            const redirectUriCallback = async (tokens: IOdspTokens) => {
                options.odspAccessToken = tokens.accessToken;
                return originalUrl;
            };
            await tokenManager.getOdspTokens(
                options.odspServer,
                options.odspClientConfig,
                true,
                redirectUriCallback,
            );
            return false;
        };
    }

    app.get("/file*", (req, res) => {
        const buffer = fs.readFileSync(req.params[0].substr(1));
        res.end(buffer);
    });
    app.get("/:id*", async (req, res) => {
        console.log(`entering corneria city "${req.url}" with${options.odspAccessToken ? "" : "out"} token`);
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
                return;
            }
        }
        fluid(req, res, baseDir, options);
    });
};

const fluid = (req: express.Request, res: express.Response, baseDir: string, options: IRouteOptions) => {

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
        FluidLoader.start(
            "${documentId}",
            pkgJson,
            options,
            document.getElementById("content"))
        .catch((error) => console.error(error));
    </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.end(html);
};
