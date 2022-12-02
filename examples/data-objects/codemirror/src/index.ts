/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import { mountableViewRequestHandler } from "@fluidframework/aqueduct";
import {
    requestFluidObject,
    RequestParser,
    RuntimeFactoryHelper,
} from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
import { FluidObject, IProvideFluidRouter } from "@fluidframework/core-interfaces";
import {
    CodeMirrorComponent,
    SmdeFactory,
} from "./codeMirror";
import {
    CodeMirrorView,
} from "./codeMirrorView";

export {
    CodeMirrorComponent,
    SmdeFactory,
} from "./codeMirror";
export {
    CodeMirrorView,
} from "./codeMirrorView";

const defaultComponentId = "default";

const smde = new SmdeFactory();

const viewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    const entryPoint: FluidObject<IProvideFluidRouter> | undefined = await runtime.entryPoint?.get();

    // We know that the ProseMirrorRuntimeFactory below sets the entryPoint of the ContainerRuntime,
    // and furthermore that it sets it to an object that implements IFluidRouter, but best practice is
    // to check explicitly anyway.
    if (entryPoint === undefined) {
        throw new Error("entryPoint for the Container Runtime was not set");
    }
    if (entryPoint.IFluidRouter === undefined) {
        throw new Error("entryPoint for the Container Runtime does not implement IFluidRouter");
    }

    if (request.pathParts.length === 0) {
        const objectRequest = RequestParser.create({
            url: ``,
            headers: request.headers,
        });
        const codeMirror = await requestFluidObject<CodeMirrorComponent>(
            entryPoint.IFluidRouter,
            objectRequest);
        return {
            status: 200,
            mimeType: "fluid/view",
            value: new CodeMirrorView(codeMirror.text, codeMirror.presenceManager),
        };
    }
};

class CodeMirrorFactory extends RuntimeFactoryHelper {
    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        const dataStore = await runtime.createDataStore(smde.type);
        await dataStore.trySetAlias(defaultComponentId);
    }

    public async preInitialize(
        context: IContainerContext,
        existing: boolean,
    ): Promise<ContainerRuntime> {
        const registry = new Map<string, Promise<IFluidDataStoreFactory>>([
            [smde.type, Promise.resolve(smde)],
        ]);

        const runtime: ContainerRuntime = await ContainerRuntime.load(
            context,
            registry,
            buildRuntimeRequestHandler(
                mountableViewRequestHandler(MountableView, [viewRequestHandler]),
            ),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
            undefined, // containerRuntimeCtor
            async (containerRuntime: IContainerRuntime) => containerRuntime.getRootDataStore(defaultComponentId),
        );

        return runtime;
    }
}

export const fluidExport = new CodeMirrorFactory();
