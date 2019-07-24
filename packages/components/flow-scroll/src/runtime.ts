/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocumentType, TableSliceType } from "@chaincode/table-document";
import { FlowDocument, flowDocumentFactory } from "@chaincode/webflow";
import { Component } from "@prague/app-component";
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { WebFlowHost, webFlowHostFactory } from "./host";

export const fluidExport = new SimpleModuleInstantiationFactory(
    WebFlowHost.type,
    new Map([
        [FlowDocument.type, Promise.resolve(flowDocumentFactory)],
        [WebFlowHost.type, Promise.resolve(webFlowHostFactory)],

        // Demo components
        ["@chaincode/math", import("@chaincode/math")],
        // Bootstrap CSS definitions conflict with flow-scroll
        // ["@chaincode/progress-bars", import("@chaincode/progress-bars")],
        [TableDocumentType, import("@chaincode/table-document").then((m) => Component.createComponentFactory(m.TableDocument))],
        [TableSliceType, import("@chaincode/table-document").then((m) => Component.createComponentFactory(m.TableSlice))],
        ["@chaincode/chart-view", import("@chaincode/chart-view").then((m) => Component.createComponentFactory(m.ChartView))],
        ["@chaincode/table-view", import("@chaincode/table-view").then((m) => Component.createComponentFactory(m.TableView))],
        ["@chaincode/charts", import(/* webpackChunkName: "charts", webpackPrefetch: true */ "@chaincode/charts")],
        ["@chaincode/video-players", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@chaincode/video-players")],
        ["@chaincode/image-collection", import(/* webpackChunkName: "image-collection", webpackPrefetch: true */ "@chaincode/image-collection")],
        // pinpoint editor's SASS loading of resources causes trouble
        // If I can change webpack to do this then things are ok
        // {
        //     test: /\.css$/,
        //     use: [
        //         "style-loader", // creates style nodes from JS strings
        //         "css-loader", // translates CSS into CommonJS
        //     ]
        // },
        // ["@chaincode/pinpoint-editor", import(/* webpackChunkName: "video-players", webpackPrefetch: true */ "@chaincode/pinpoint-editor")],
    ]),
);

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
      return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    return fluidExport.instantiateComponent(context);
}
