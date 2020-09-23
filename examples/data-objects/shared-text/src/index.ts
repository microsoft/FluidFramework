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
    IFluidDataStoreRegistry,
    NamedFluidDataStoreRegistryEntries,
} from "@fluidframework/runtime-definitions";
import {
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
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

const defaultRegistryEntries: NamedFluidDataStoreRegistryEntries = [
    ["@fluid-example/math", math.then((m) => m.fluidExport)],
    ["@fluid-example/progress-bars", progressBars.then((m) => m.fluidExport)],
    ["@fluid-example/video-players", videoPlayers.then((m) => m.fluidExport)],
    ["@fluid-example/image-collection", images.then((m) => m.fluidExport)],
];

class MyRegistry implements IFluidDataStoreRegistry {
    constructor(
        private readonly context: IContainerContext,
        private readonly defaultRegistry: string) {
    }

    public get IFluidDataStoreRegistry() { return this; }

    public async get(name: string): Promise<IFluidDataStoreFactory> {
        const scope = `${name.split("/")[0]}:cdn`;
        const config = {};
        config[scope] = this.defaultRegistry;

        const codeDetails = {
            package: name,
            config,
        };
        const fluidModule = await this.context.codeLoader.load(codeDetails);
        return fluidModule.fluidExport.IFluidDataStoreFactory;
    }
}

class SharedTextFactoryComponent implements IFluidDataStoreFactory, IRuntimeFactory {
    public static readonly type = "@fluid-example/shared-text";
    public readonly type = SharedTextFactoryComponent.type;

    public get IFluidDataStoreFactory() { return this; }
    public get IRuntimeFactory() { return this; }

    public instantiateDataStore(context: IFluidDataStoreContext): void {
        return sharedTextComponent.instantiateDataStore(context);
    }

    /**
     * Instantiates a new chaincode host
     */
    public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
        const runtime = await ContainerRuntime.load(
            context,
            [
                ...defaultRegistryEntries,
                [SharedTextFactoryComponent.type, Promise.resolve(this)],
                [
                    "verdaccio",
                    Promise.resolve(new MyRegistry(context, "https://pragueauspkn.azureedge.net")),
                ],
            ],
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
