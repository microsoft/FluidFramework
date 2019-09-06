/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable no-var-requires no-unsafe-any non-literal-fs-path
import * as fs from "fs";
import * as moniker from "moniker";
import * as path from "path";

export const before = (app, server, baseDir, env) => {
    let options;
    if (!env) {
        options = { local: false };
    } else if (env.fluidHost && !(env.tenantId && env.tenantSecret)) {
        throw new Error("If you provide a host, you must provide a tenantId and tenantSecret");
    } else if ((env.tenantId || env.tenantSecret) && !(env.tenantId && env.tenantSecret)) {
        throw new Error("tenantId and tenantSecret must be provided together");
    } else {
        options = env;
    }

    app.get("/", (req, res) => res.redirect(`/${moniker.choose()}`));
    app.get("/fluid-loader.js", (req, res) => loader(req, res, baseDir));
    app.get(/(.*(?<!\.js(\.map)?))$/i, (req, res) => fluid(req, res, baseDir, options));
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

    if (options.local) {
        host = "http://localhost:3000";
        routerlicious = "http://localhost:3003";
        historian = "http://localhost:3001";
        tenantId = "prague";
        secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
        npm = "http://localhost:3002";
    } else {
        host = options.fluidHost ? options.fluidHost : "https://www.wu2.prague.office-int.com";
        tenantId = options.tenantId ? options.tenantId : "stoic-gates";
        secret = options.tenantSecret ? options.tenantSecret : "1a7f744b3c05ddc525965f17a1b58aa0";
        routerlicious = host.replace("www", "alfred");
        historian = host.replace("www", "historian");
        npm = "https://pragueauspkn-3873244262.azureedge.net";
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
