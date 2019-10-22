/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";
import { WebFlowHost, webFlowHostFactory } from "./host";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlowHost.type,
    new Map([
        [WebFlowHost.type, Promise.resolve(webFlowHostFactory)],

        // Demo components
        // Bootstrap CSS definitions conflict with flow-scroll
        // ["@fluid-example/progress-bars", import("@fluid-example/progress-bars")],
        // pinpoint editor's SASS loading of resources causes trouble
        // If I can change webpack to do this then things are ok
        // {
        //     test: /\.css$/,
        //     use: [
        //         "style-loader", // creates style nodes from JS strings
        //         "css-loader", // translates CSS into CommonJS
        //     ]
        // },
        // ["@fluid-example/pinpoint-editor", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@fluid-example/pinpoint-editor")],
    ]),
);
