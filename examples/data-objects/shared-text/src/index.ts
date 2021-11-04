/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// set the base path for all dynamic imports first
// eslint-disable-next-line import/no-unassigned-import
import "./publicpath";

import { AgentSchedulerFactory } from "@fluidframework/agent-scheduler";
import { IContainerContext } from "@fluidframework/container-definitions";
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
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { IFluidRouter } from "@fluidframework/core-interfaces";
import * as sharedTextComponent from "./component";

/* eslint-disable max-len */
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

class SharedTextFactoryComponent extends RuntimeFactoryHelper implements IFluidDataStoreFactory {
    public static readonly type = "@fluid-example/shared-text";
    public readonly type = SharedTextFactoryComponent.type;

    public get IFluidDataStoreFactory() { return this; }

    public async instantiateDataStore(context: IFluidDataStoreContext, existing?: boolean) {
        return sharedTextComponent.instantiateDataStore(context, existing);
    }

    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(AgentSchedulerFactory.type, "_scheduler");
        await runtime.createRootDataStore(SharedTextFactoryComponent.type, DefaultComponentName);
    }

    public async preInitialize(
        context: IContainerContext,
    ): Promise<ContainerRuntime> {
        let router: IFluidRouter | undefined;
        const handler =  buildRuntimeRequestHandler(
            defaultRouteRequestHandler(DefaultComponentName),
            innerRequestHandler,
        );

        const runtime: ContainerRuntime = await ContainerRuntime.load2(
            context,
            [
                [SharedTextFactoryComponent.type, Promise.resolve(this)],
                AgentSchedulerFactory.registryEntry,
            ],
            async (cr)=>{
                if(router === undefined) {
                    router = {
                        get IFluidRouter() {return this;},
                        request: async (req)=>handler(req,cr),
                    };
                }
                return router;
            },
        );

        return runtime;
    }
}

export * from "./utils";

export const fluidExport = new SharedTextFactoryComponent();
