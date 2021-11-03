/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";

import { ContactCollectionInstantiationFactory } from "./dataObject";

const contactCollectionId = "contactCollection";

// All requests will be routed to the ContactCollection, so e.g. of the format "/contactId".
// If we wanted to permit routing to other DO's then we might use a url format more like
// "/contactCollection/contactId".

class ContactCollectionContainerRuntimeFactoryType extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([ContactCollectionInstantiationFactory.registryEntry]),
            [],
        );
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        await runtime.createRootDataStore(ContactCollectionInstantiationFactory.type, contactCollectionId);
    }
}

/**
 * The ContactCollectionContainerRuntimeFactory is the container code for our scenario.
 */
export const ContactCollectionContainerRuntimeFactory = new ContactCollectionContainerRuntimeFactoryType();
