/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocumentType, TableSliceType } from "@chaincode/table-document";
import { flowDocumentFactory, FlowDocumentType } from "@chaincode/webflow";
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { WebFlowHost, webFlowHostFactory } from "./host";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlowHost.type,
    new Map([
        [FlowDocumentType, Promise.resolve(flowDocumentFactory)],
        [WebFlowHost.type, Promise.resolve(webFlowHostFactory)],

        // Demo components
        ["@fluid-example/math", import("@fluid-example/math").then((m) => m.fluidExport)],
        // Bootstrap CSS definitions conflict with flow-scroll
        // ["@fluid-example/progress-bars", import("@fluid-example/progress-bars")],
        [TableDocumentType, import("@chaincode/table-document").then((m) => m.TableDocument.getFactory())],
        [TableSliceType, import("@chaincode/table-document").then((m) => m.TableSlice.getFactory())],
        ["@chaincode/table-view", import("@chaincode/table-view").then((m) => m.TableView.getFactory())],
        ["@fluid-example/video-players", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@fluid-example/video-players").then((m) => m.fluidExport)],
        ["@fluid-example/image-collection", import(/* webpackChunkName: "image-collection", webpackPrefetch: true */ "@fluid-example/image-collection").then((m) => m.fluidExport)],
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
