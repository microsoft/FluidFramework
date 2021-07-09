/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// eslint-disable-next-line import/no-unassigned-import
import "./publicpath";

import { AgentSchedulerFactory } from "@fluidframework/agent-scheduler";
import { IContainerContext, IRuntime, IRuntimeFactory } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import {
    IFluidDataStoreContext,
    IFluidDataStoreFactory,
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    ["@fluid-example/math", math.then((m) => m.fluidExport)],
];

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
            [
                ...defaultRegistryEntries,
                [SharedTextFactoryComponent.type, Promise.resolve(this)],
                AgentSchedulerFactory.registryEntry,
            ],
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(DefaultComponentName),
                innerRequestHandler,
            ),
        );

        // On first boot create the base component
        if (!runtime.existing) {
            await runtime.createRootDataStore(AgentSchedulerFactory.type, "_scheduler");
            await runtime.createRootDataStore(SharedTextFactoryComponent.type, DefaultComponentName);
        }

        return runtime;
    }
}

export * from "./utils";

export const fluidExport = new SharedTextFactoryComponent();
