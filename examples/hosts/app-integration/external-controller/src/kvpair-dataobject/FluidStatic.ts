/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Container } from "@fluidframework/container-loader";
import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";
import { DropletContainerRuntimeFactory } from "./containerCode";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Fluid {
    public static async createContainer(docId): Promise<Container> {
        return getTinyliciousContainer(docId, DropletContainerRuntimeFactory, true /* createNew */);
    }

    public static async getContainer(docId): Promise<Container> {
        return getTinyliciousContainer(docId, DropletContainerRuntimeFactory, false /* createNew */);
    }
}
