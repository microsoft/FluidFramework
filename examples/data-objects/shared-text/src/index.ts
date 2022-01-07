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
    innerRequestHandler,
    buildRuntimeRequestHandler,
} from "@fluidframework/request-handler";
import { defaultRouteRequestHandler } from "@fluidframework/aqueduct";
import { RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { SharedTextDataStoreFactory } from "./component";

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

class SharedTextContainerRuntimeFactory extends RuntimeFactoryHelper {
    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(AgentSchedulerFactory.type, "_scheduler");
        await runtime.createRootDataStore(SharedTextDataStoreFactory.type, DefaultComponentName);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            [
                [SharedTextDataStoreFactory.type, Promise.resolve(new SharedTextDataStoreFactory())],
                AgentSchedulerFactory.registryEntry,
            ],
            buildRuntimeRequestHandler(
                defaultRouteRequestHandler(DefaultComponentName),
                innerRequestHandler,
            ),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
        );

        return runtime;
    }
}

export const fluidExport = new SharedTextContainerRuntimeFactory();
