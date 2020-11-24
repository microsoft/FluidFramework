/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// eslint-disable-next-line import/no-unassigned-import
import "./publicpath";

import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
} from "@fluidframework/runtime-definitions";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { createDataStoreRegistry } from "@fluidframework/runtime-utils";
import * as sharedTextComponent from "./component";

/* eslint-disable max-len */
const math = import(/* webpackChunkName: "math", webpackPrefetch: true */ "@fluid-example/math");
// const monaco = import(/* webpackChunkName: "monaco", webpackPrefetch: true */ "@fluid-example/monaco");
const progressBars = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@fluid-example/progress-bars");
const videoPlayers = import(
    /* webpackChunkName: "collections", webpackPrefetch: true */ "@fluid-example/video-players");
const images = import(
    /* webpackChunkName: "image-collection", webpackPrefetch: true */ "@fluid-example/image-collection");

const DefaultComponentName = "text";

// (self as any).MonacoEnvironment = {
// 	getWorkerUrl: function (moduleId, label) {
// 		switch (label) {
// 			case 'json': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/json/json.worker');
// 			case 'css': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/css/css.worker');
// 			case 'html': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/html/html.worker');
// 			case 'typescript':
// 			case 'javascript': return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/language/typescript/ts.worker');
// 			default:
// 				return require('blob-url-loader?type=application/javascript!compile-loader?target=worker&emit=false!monaco-editor/esm/vs/editor/editor.worker');
// 		}
// 	}
// };
/* eslint-enable max-len */

class SharedTextFactoryComponent implements IFluidDataStoreFactory, IRuntimeFactory {
    public static readonly type = "@fluid-example/shared-text";
    public readonly type = SharedTextFactoryComponent.type;

    public get IFluidDataStoreFactory() { return this; }
    public get IRuntimeFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext) {
        return sharedTextComponent.instantiateDataStore(context);
    }

    /**
     * Instantiates a new chaincode host
     */
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            createDataStoreRegistry(
                [
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    ["@fluid-example/math", math.then((m) => m.fluidExport)],
                    ["@fluid-example/progress-bars", progressBars.then((m) => m.fluidExport)],
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                    ["@fluid-example/video-players", videoPlayers.then((m) => m.fluidExport)],
                    ["@fluid-example/image-collection", images.then((m) => m.fluidExport)],
                    [SharedTextFactoryComponent.type, Promise.resolve(this)],
                ]),
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(DefaultComponentName),
                innerRequestHandler,
            ),
        );

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createRootDataStore(SharedTextFactoryComponent.type, DefaultComponentName);
        }

        return runtime;
    }
}

export * from "./utils";

export const fluidExport = new SharedTextFactoryComponent();
