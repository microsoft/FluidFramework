/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// const path = require("path");
const { htmlPlugin } = require("@craftamap/esbuild-plugin-html");
const esbuild = require("esbuild");

// const NodePolyFillsPlugin = {
//     name: "NodePolyFillsPlugin",
//     setup(build) {
//         // build.onResolve({ filter: nodeGlobalsToBeIgnored }, (args) => {
//         //     return { path: args.path, namespace: "do-nothing" };
//         // });

//         // Resolve other packages
//         build.onResolve(
//             {
//                 filter: /^((process))$/,
//             },
//             (args) => {
//                 const pPrefix = [__dirname, "node_modules"];
//                 let p;
//                 switch (args.path) {
//                     case "buffer":
//                         p = path.join(...pPrefix, "buffer", "index.js");
//                         break;
//                     case "process":
//                         p = path.join(...pPrefix, "process", "browser.js");
//                         break;
//                 }
//                 return { path: p };
//             }
//         );
//     },
// };

esbuild.build({
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
            files: [{
                entryPoints: ["src/app.ts"],
                filename: "index.html",
                htmlTemplate: "src/index.html"
            }],
        }),
        // NodePolyFillsPlugin,
    ],
    logOverride: {
        "equals-new-object": "info",
    },
}).catch(() => process.exit(1));
