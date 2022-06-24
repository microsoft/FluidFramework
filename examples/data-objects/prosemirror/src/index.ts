/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { mountableViewRequestHandler } from "@fluidframework/aqueduct";
import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { buildRuntimeRequestHandler } from "@fluidframework/request-handler";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { requestFluidObject, RequestParser, RuntimeFactoryHelper } from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
import { fluidExport as smde, ProseMirror, ProseMirrorView } from "./prosemirror";

export { ProseMirror, ProseMirrorFactory, ProseMirrorView } from "./prosemirror";

const defaultComponentId = "default";

const viewRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    if (request.pathParts.length === 0) {
        const objectRequest = RequestParser.create({
            url: ``,
            headers: request.headers,
        });
        const proseMirror = await requestFluidObject<ProseMirror>(
            await runtime.getRootDataStore(defaultComponentId),
            objectRequest);
        return { status: 200, mimeType: "fluid/view", value: new ProseMirrorView(proseMirror.collabManager) };
    }
};

class ProseMirrorRuntimeFactory extends RuntimeFactoryHelper {
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

        const runtime = await ContainerRuntime.load(
            context,
            registry,
            buildRuntimeRequestHandler(
                mountableViewRequestHandler(MountableView, [viewRequestHandler]),
            ),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
        );

        return runtime;
    }
}

export const fluidExport = new ProseMirrorRuntimeFactory();
