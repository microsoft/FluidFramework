/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { CollaborativeText } from "./fluid-object/";
import { makeModelRequestHandler, ModelMakerCallback } from "./modelLoader";

export interface ICollaborativeTextAppModel {
    collaborativeText: CollaborativeText;
}

class CollaborativeTextAppModel {
    public constructor(public readonly collaborativeText: CollaborativeText) { }
}

export const collaborativeTextId = "collaborative-text";

const makeCollaborativeTextAppModel: ModelMakerCallback<ICollaborativeTextAppModel> =
    async (runtime: IContainerRuntime, container: IContainer) => {
        const collaborativeText = await requestFluidObject<CollaborativeText>(
            await runtime.getRootDataStore(collaborativeTextId),
            "",
        );
        return new CollaborativeTextAppModel(collaborativeText);
    };

export class CollaborativeTextContainerRuntimeFactory extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([
                CollaborativeText.getFactory().registryEntry,
            ]), // registryEntries
            undefined,
            [
                makeModelRequestHandler(makeCollaborativeTextAppModel),
            ],
        );
    }

    /**
     * {@inheritDoc BaseContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const inventoryList = await runtime.createDataStore(CollaborativeText.getFactory().type);
        await inventoryList.trySetAlias(collaborativeTextId);
    }
}
