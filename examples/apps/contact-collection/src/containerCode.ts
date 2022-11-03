/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ModelContainerRuntimeFactory } from "@fluid-example/example-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";

import { ContactCollectionInstantiationFactory, IContactCollection } from "./dataObject";

const contactCollectionId = "contactCollection";

export interface IContactCollectionAppModel {
    readonly contactCollection: IContactCollection;
}

class ContactCollectionAppModel implements IContactCollectionAppModel {
    public constructor(public readonly contactCollection: IContactCollection) { }
}

export class ContactCollectionContainerRuntimeFactory extends ModelContainerRuntimeFactory<IContactCollectionAppModel> {
    public constructor() {
        super(
            new Map([
                ContactCollectionInstantiationFactory.registryEntry,
            ]), // registryEntries
        );
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.containerInitializingFirstTime}
     */
    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const dataStore = await runtime.createDataStore(ContactCollectionInstantiationFactory.type);
        await dataStore.trySetAlias(contactCollectionId);
    }

    /**
     * {@inheritDoc ModelContainerRuntimeFactory.createModel}
     */
    protected async createModel(runtime: IContainerRuntime, container: IContainer) {
        const contactCollection = await requestFluidObject<IContactCollection>(
            await runtime.getRootDataStore(contactCollectionId),
            "",
        );
        return new ContactCollectionAppModel(contactCollection);
    }
}
