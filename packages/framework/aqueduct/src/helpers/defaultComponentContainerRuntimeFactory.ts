/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    componentRuntimeRequestHandler,
    RequestParser,
    RuntimeRequestHandler,
} from "@microsoft/fluid-container-runtime";
import { IComponentDefaultFactoryName } from "@microsoft/fluid-framework-interfaces";
import {
    IHostRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import {
    ContainerServiceRegistryEntries,
} from "../containerServices";
import { BaseContainerRuntimeFactory } from "./baseContainerRuntimeFactory";

const defaultComponentId = "default";

const defaultComponentRuntimeRequestHandler: RuntimeRequestHandler =
    async (request: RequestParser, runtime: IHostRuntime) => {
        if (request.pathParts.length === 0) {
            return componentRuntimeRequestHandler(
                new RequestParser({
                    url: defaultComponentId,
                    headers: request.headers,
                }),
                runtime);
        }
        return undefined;
    };

export class DefaultComponentContainerRuntimeFactory extends BaseContainerRuntimeFactory implements
    IComponentDefaultFactoryName {
    constructor(
        private readonly defaultComponentName: string,
        registryEntries: NamedComponentRegistryEntries,
        serviceRegistry: ContainerServiceRegistryEntries = [],
        requestHandlers: RuntimeRequestHandler[] = [],
    ) {
        super(registryEntries, serviceRegistry, [defaultComponentRuntimeRequestHandler, ...requestHandlers]);
    }

    public get IComponentDefaultFactoryName() { return this; }
    public getDefaultFactoryName() { return this.defaultComponentName; }

    /**
     * Calls create, initialize, and attach on a new component.
     *
     * @param runtime - It is the runtime for the container.
     * @param id - unique component id for the new component
     * @param pkg - package name for the new component
     */
    public static async createAndAttachComponent<T>(
        runtime: IHostRuntime,
        id: string,
        pkg: string,
    ): Promise<T> {
        try {
            const componentRuntime = await runtime.createComponent(id, pkg);

            const result = await componentRuntime.request({ url: "/" });
            if (result.status !== 200 || result.mimeType !== "fluid/component") {
                throw new Error("Failed to get component.");
            }

            componentRuntime.attach();

            return result.value as T;
        } catch (error) {
            runtime.error(error);
            throw error;
        }
    }

    protected async containerInitializingFirstTime(runtime: IHostRuntime) {
        // Debug(`createAndAttachComponent(chaincode=${chaincode})`);
        await DefaultComponentContainerRuntimeFactory.createAndAttachComponent(
            runtime, defaultComponentId, this.defaultComponentName);
    }
}
