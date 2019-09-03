/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable no-var-requires no-unsafe-any non-literal-fs-path
import * as fs from "fs";
import * as moniker from "moniker";
import * as path from "path";

export const before = (app, server, baseDir, options) => {
    app.get("/", docMoniker);
    app.get("/fluid-loader.js", (req, res) => loader(req, res, baseDir));
    app.get("/dist/main.bundle.js", (req, res) => main(req, res, baseDir));
    app.get("/*", (req, res) => {
        fluid(req, res, baseDir, (!options || !options.live)
            ? { live: false }
            : {
                // if live === true, expect these all to be defined
                live: options.live,
                fluidHost: options.fluidHost,
                tenantId: options.tenantId,
                tenantSecret: options.tenantSecret,
                component: options.component,
            }
        );
    });
};

const fluid = (req, res, baseDir, options) => {
    const rawPath = req.params[0];
    const slash = rawPath.indexOf("/");
    const documentId = rawPath.substring(
        0,
        slash !== -1 ? slash : rawPath.length
    );
    // tslint:disable-next-line: non-literal-require
    const packageJson = require(path.join(baseDir, "./package.json"));
    const bearerSecret = "VBQyoGpEYrTn3XQPtXW3K8fFDd";

    let host;
    let routerlicious;
    let historian;
    let tenantId;
    let secret;
    let npm;

    if (options.live) {
        host = options.fluidHost;
        routerlicious = host.replace("www", "alfred");
        historian = host.replace("www", "historian");
        tenantId = options.tenantId;
        secret = options.tenantSecret;
        npm = "https://fluidauspkn-3873244262.azureedge.net";
    } else {
        host = "http://localhost:3000";
        routerlicious = "http://localhost:3003";
        historian = "http://localhost:3001";
        tenantId = "prague";
        secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
        npm = "http://localhost:3002";
    }

    const html =
`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${documentId}</title>
</head>
<body>
    <div style="width: 100vw; height: 100vh;">
        <div id="content"></div>
    </div>

    <script src="/fluid-loader.js"></script>
    <script>
        var pkgJson = ${JSON.stringify(packageJson)};
        FluidLoader.start(
            pkgJson,
            "${host}",
            "${routerlicious}",
            "${historian}",
            "${npm}",
            "${tenantId}",
            "${secret}",
            FluidLoader.getUserToken("${bearerSecret}"),
            document.getElementById("content"),
            ${!!options.component})
        .catch((error) => console.error(error));
    </script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.end(html);
};

const loader = (req, res, baseDir) => {
    res.setHeader("Content-Type", "application/javascript");

    fs.createReadStream(
        path.join(baseDir, "node_modules", "@microsoft", "fluid-webpack-component-loader", "dist", "fluid-loader.bundle.js")
    ).pipe(res);
};

const main = (req, res, baseDir) => {
    res.setHeader("Content-Type", "application/javascript");

    fs.createReadStream(
        path.join(baseDir, "dist", "main.bundle.js")
    ).pipe(res);
};

const docMoniker = (req, res) => {
    res.redirect(`/${moniker.choose()}`);
};
