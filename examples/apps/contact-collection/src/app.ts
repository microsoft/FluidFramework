/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";

import { ContactCollectionContainerRuntimeFactory } from "./containerCode";
import { IContact, IContactCollection } from "./dataObject";
import { renderContact, renderContactCollection } from "./view";

const searchParams = new URLSearchParams(location.search);
const specifiedContact = searchParams.get("contact") ?? undefined;

/**
 * A helper function that can generate an app-defined URL that will navigate to the single contact view.
 * Similar to getAbsoluteUrl in other Fluid examples, but keeping the control over URL format in the app
 * rather than the URL resolver.  Fluid doesn't need to know about this URL format in this example, only
 * the view (for rendering hyperlinks to single-contact view).
 * @param contactId - The ID of the contact to load in details view
 * @returns A URL that will navigate to single-contact view of the given contact
 */
const getContactUrl = (contactId: string): string => {
    const contactUrl = new URL(location.toString());
    contactUrl.search = `?contact=${contactId}`;
    return contactUrl.toString();
};

// In interacting with the service, we need to be explicit about whether we're creating a new document vs. loading
// an existing one.  We also need to provide the unique ID for the document we are loading from.

// In this app, we'll choose to create a new document when navigating directly to http://localhost:8080.
// We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:8080/#1596520748752.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
async function start(): Promise<void> {
    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    // The getTinyliciousContainer helper function facilitates loading our container code into a Container and
    // connecting to a locally-running test service called Tinylicious.  This will look different when moving to a
    // production service, but ultimately we'll still be getting a reference to a Container object.  The helper
    // function takes the ID of the document we're creating or loading, the container code to load into it, and a
    // flag to specify whether we're creating a new document or loading an existing one.
    const [container, containerId] = await getTinyliciousContainer(
        documentId, ContactCollectionContainerRuntimeFactory, shouldCreateNew,
    );

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

    // Since we're using a ContainerRuntimeFactoryWithDefaultDataStore, our contact collection is available
    // at the URL "/".  Since it's using the collection pattern, it will interpret subrequests as requests for a
    // single contact.
    const url = `/${specifiedContact ?? ""}`;
    const response = await container.request({ url });

    // Verify the response to make sure we got what we expected.
    if (response.status !== 200 || response.mimeType !== "fluid/object") {
        throw new Error(`Unable to retrieve data object at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    const div = document.getElementById("content") as HTMLDivElement;

    // Our app has two rendering modes, contact list and single contact details view.  The app owns the url format,
    // and here we've chosen to use the query params to pass the single contact id if that's the view we want (notice
    // that getContactUrl generates urls of this format).  Alternate implementations might use the URL path or other
    // routing strategies to specify the view to use -- it's all up to the app.
    if (specifiedContact === undefined) {
        // If a contact was not specified, we'll render the full collection.
        const contactCollection: IContactCollection = response.value;
        renderContactCollection(contactCollection, getContactUrl, div);
    } else {
        // If a contact was specified, we'll render just that contact.
        const contact: IContact = response.value;
        renderContact(contact, div);
    }
}

start().catch((error) => console.error(error));
