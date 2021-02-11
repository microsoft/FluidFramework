/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";
import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions";
import { DOProviderContainerRuntimeFactory } from "./containerCode";

export class FluidDocument {
    constructor(private readonly container: IContainer, public readonly createNew: boolean) { }

    public async createDataObject<T = any>(type: string, id: string) {
        await this.container.request({ url: `/create/${type}/${id}` });
        const dataObject = await this.getDataObject<T>(id);
        return dataObject;
    }

    public async getDataObject<T = any>(id: string) {
        const dataObject = await getObjectWithIdFromContainer<T>(id, this.container);
        return dataObject;
    }
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Fluid {
    public static async createDocument(
        docId: string,
        registryEntries: NamedFluidDataStoreRegistryEntry[],
    ): Promise<FluidDocument> {
        const container = await getTinyliciousContainer(
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            true, /* createNew */
        );
        const document = new FluidDocument(container, true /* createNew */);
        return document;
    }
    public static async getDocument(
        docId: string,
        registryEntries: NamedFluidDataStoreRegistryEntry[],
    ): Promise<FluidDocument> {
        const container = await getTinyliciousContainer(
            docId,
            new DOProviderContainerRuntimeFactory(registryEntries),
            false, /* createNew */
        );
        const document = new FluidDocument(container, false /* createNew */);
        return document;
    }
}
