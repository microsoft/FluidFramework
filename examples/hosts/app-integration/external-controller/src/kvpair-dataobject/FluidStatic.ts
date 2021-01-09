/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getObjectWithIdFromContainer } from "@fluidframework/aqueduct";
import { Container } from "@fluidframework/container-loader";
import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import { DropletContainerRuntimeFactory } from "./containerCode";

export class FluidDocument {
    constructor(private readonly container: Container, public readonly createNew: boolean) { }

    public async createDroplet<T = any>(type: string, id: string) {
        await this.container.request({ url: `/create/${type}/${id}` });
        const droplet = await this.getDroplet<T>(id);
        return droplet;
    }

    public async getDroplet<T = any>(id: string) {
        const droplet = await getObjectWithIdFromContainer<T>(id, this.container);
        return droplet;
    }
}
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Fluid {
    public static async createDocument(docId: string): Promise<FluidDocument> {
        const container = await getTinyliciousContainer(docId, DropletContainerRuntimeFactory, true /* createNew */);
        const document = new FluidDocument(container, true /* createNew */);
        return document;
    }
    public static async getDocument(docId: string): Promise<FluidDocument> {
        const container = await getTinyliciousContainer(docId, DropletContainerRuntimeFactory, false /* createNew */);
        const document = new FluidDocument(container, false /* createNew */);
        return document;
    }
}
