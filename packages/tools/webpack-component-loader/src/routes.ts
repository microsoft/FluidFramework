/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as express from "express";
import * as fs from "fs";
import * as moniker from "moniker";
import * as nconf from "nconf";
import * as path from "path";
import WebpackDevServer from "webpack-dev-server";
import { IRouteOptions } from "./loader";

export const before = (app: express.Application, server: WebpackDevServer) => {
    // tslint:disable-next-line no-unsafe-any
    app.get("/", (req, res) => res.redirect(`/${moniker.choose()}`));
};

export const after = (app: express.Application, server: WebpackDevServer, baseDir: string, env: IRouteOptions) => {
    const options: IRouteOptions = env ? env : { mode: "local" };
    options.mode = options.mode ? options.mode : "local";
    const config: nconf.Provider = nconf.env("__").file(path.join(baseDir, "config.json"));
    // tslint:disable: no-unsafe-any
    options.fluidHost = options.fluidHost ? options.fluidHost : config.get("fluid:webpack:fluidHost");
    options.tenantId = options.tenantId ? options.tenantId : config.get("fluid:webpack:tenantId");
    options.tenantSecret = options.tenantSecret ? options.tenantSecret : config.get("fluid:webpack:tenantSecret");
    options.bearerSecret = options.bearerSecret ? options.bearerSecret : config.get("fluid:webpack:bearerSecret");
    options.npm = options.npm ? options.npm : config.get("fluid:webpack:npm");
    // tslint:enable: no-unsafe-any

    if (options.mode === "live" && !(options.tenantId && options.tenantSecret)) {
        throw new Error("You must provide a tenantId and tenantSecret to connect to a live server");
    } else if ((options.tenantId || options.tenantSecret) && !(options.tenantId && options.tenantSecret)) {
        throw new Error("tenantId and tenantSecret must be provided together");
    }
    console.log(options);
    app.get("/file*", (req, res) => {
        // tslint:disable-next-line: non-literal-fs-path no-unsafe-any
        const buffer = fs.readFileSync(req.params[0].substr(1));
        res.end(buffer);
    });
    app.get("/:id*", (req, res) => fluid(req, res, baseDir, options));
};

const fluid = (req: express.Request, res: express.Response,  baseDir: string, options: IRouteOptions) => {

    const documentId = req.params.id;
    // tslint:disable-next-line: non-literal-require
    const packageJson = require(path.join(baseDir, "./package.json"));

    const html =
`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentId}</title>
</head>
<body>
    <div style="width: 100%; height: 100%;">
        <div id="content"></div>
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
