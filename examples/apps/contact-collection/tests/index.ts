/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SessionStorageModelLoader, StaticCodeLoader } from "@fluid-example/example-utils";

import { renderContactCollection } from "../src/view";
import { ContactCollectionContainerRuntimeFactory, IContactCollectionAppModel } from "../src/containerCode";

const getContactUrl = (contactId: string): string => {
    const contactUrl = new URL(location.toString());
    contactUrl.search = `?contact=${contactId}`;
    return contactUrl.toString();
};

/**
 * This is a helper function for loading the page. It's required because getting the Fluid Container
 * requires making async calls.
 */
export async function createContainerAndRenderInElement(element: HTMLDivElement) {
    const sessionStorageModelLoader = new SessionStorageModelLoader<IContactCollectionAppModel>(
        new StaticCodeLoader(new ContactCollectionContainerRuntimeFactory()),
    );

    let id: string;
    let model: IContactCollectionAppModel;

    if (location.hash.length === 0) {
        // Normally our code loader is expected to match up with the version passed here.
        // But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
        // the version doesn't actually matter.
        const createResponse = await sessionStorageModelLoader.createDetached("1.0");
        model = createResponse.model;
        id = await createResponse.attach();
    } else {
        id = location.hash.substring(1);
        model = await sessionStorageModelLoader.loadExisting(id);
    }

    // update the browser URL and the window title with the actual container ID
    location.hash = id;
    document.title = id;


    // Given an IContactCollection, we can render its data using the view we've created in our app.
    renderContactCollection(model.contactCollection, getContactUrl, element);

    // Setting "fluidStarted" is just for our test automation
    // eslint-disable-next-line @typescript-eslint/dot-notation
    window["fluidStarted"] = true;
}

/**
 * For local testing we have two div's that we are rendering into independently.
 */
async function setup() {
    const leftElement = document.getElementById("sbs-left") as HTMLDivElement;
    if (leftElement === null) {
        throw new Error("sbs-left does not exist");
    }
    await createContainerAndRenderInElement(leftElement);
    const rightElement = document.getElementById("sbs-right") as HTMLDivElement;
    if (rightElement === null) {
        throw new Error("sbs-right does not exist");
    }
    await createContainerAndRenderInElement(rightElement);
}

setup().catch((e)=> {
    console.error(e);
    console.log(
        "%cThere were issues setting up and starting the in memory FLuid Server",
        "font-size:30px");
});
