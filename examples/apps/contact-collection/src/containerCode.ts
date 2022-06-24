/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory } from "@fluidframework/aqueduct";
import { IContainerRuntime } from "@fluidframework/container-runtime-definitions";
import { IFluidRouter } from "@fluidframework/core-interfaces";
import { requestFluidObject, RequestParser } from "@fluidframework/runtime-utils";

import { ContactCollectionInstantiationFactory } from "./dataObject";

const contactCollectionId = "contactCollection";

// All requests will be routed to the ContactCollection, so e.g. of the format "/contactId".
// If we wanted to permit routing to other DO's then we might use a url format more like
// "/contactCollection/contactId".
const collectionRequestHandler = async (request: RequestParser, runtime: IContainerRuntime) => {
    const response = await requestFluidObject<IFluidRouter>(
        await runtime.getRootDataStore(contactCollectionId),
        request);
    return { status: 200, mimeType: "fluid/object", value: response };
};

class ContactCollectionContainerRuntimeFactoryType extends BaseContainerRuntimeFactory {
    constructor() {
        super(
            new Map([ContactCollectionInstantiationFactory.registryEntry]),
            undefined,
            [collectionRequestHandler],
        );
    }

    protected async containerInitializingFirstTime(runtime: IContainerRuntime) {
        const dataStore = await runtime.createDataStore(ContactCollectionInstantiationFactory.type);
        await dataStore.trySetAlias(contactCollectionId);
    }
}

/**
 * The ContactCollectionContainerRuntimeFactory is the container code for our scenario.
 */
export const ContactCollectionContainerRuntimeFactory = new ContactCollectionContainerRuntimeFactoryType();
