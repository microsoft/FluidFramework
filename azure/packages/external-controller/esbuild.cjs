/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const { htmlPlugin } = require("@craftamap/esbuild-plugin-html");
const esbuild = require("esbuild");

const buildOptions = {
    entryPoints: ["src/app.ts"],
    bundle: true,
    metafile: true, // needs to be set
    outdir: "dist/", // needs to be set
    sourcemap: true,
    define: {
        "process.env.NODE_DEBUG": `"false"`,
        "process.env.FLUID_CLIENT": `"local"`,
    },
    plugins: [
        htmlPlugin({
            files: [
                {
                    entryPoints: ["src/app.ts"],
                    filename: "index.html",
                    htmlTemplate: "src/index.html",
                },
            ],
        }),
    ],
    logOverride: {
        "equals-new-object": "error",
    },
};

esbuild.build(buildOptions).catch(() => process.exit(1));

module.exports = {
    buildOptions,
};
