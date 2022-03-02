/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContainerContext } from "@fluidframework/container-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions";
import { buildRuntimeRequestHandler, RuntimeRequestHandler } from "@fluidframework/request-handler";
import { mountableViewRequestHandler } from "@fluidframework/aqueduct";
import {
    requestFluidObject,
    RequestParser,
    RuntimeFactoryHelper,
} from "@fluidframework/runtime-utils";
import { MountableView } from "@fluidframework/view-adapters";
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

type ViewCallback<T> = (fluidModel: T) => any;

const makeViewRequestHandler = <T>(viewCallback: ViewCallback<T>): RuntimeRequestHandler =>
    async (request: RequestParser, runtime: IContainerRuntime) => {
        if (request.pathParts.length === 0) {
            const objectRequest = RequestParser.create({
                url: ``,
                headers: request.headers,
            });
            const fluidObject = await requestFluidObject<T>(
                await runtime.getRootDataStore(defaultComponentId),
                objectRequest);
            const viewResponse = viewCallback(fluidObject);
            return { status: 200, mimeType: "fluid/view", value: viewResponse };
        }
    };

const viewCallback =
    (codeMirror: CodeMirrorComponent) => new CodeMirrorView(codeMirror.text, codeMirror.presenceManager);

class CodeMirrorFactory extends RuntimeFactoryHelper {
    public async instantiateFirstTime(runtime: ContainerRuntime): Promise<void> {
        await runtime.createRootDataStore(smde.type, defaultComponentId);
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
                mountableViewRequestHandler(MountableView, [makeViewRequestHandler(viewCallback)]),
            ),
            undefined, // runtimeOptions
            undefined, // containerScope
            existing,
        );

        return runtime;
    }
}

export const fluidExport = new CodeMirrorFactory();
