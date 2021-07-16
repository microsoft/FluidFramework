/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTinyliciousContainer } from "@fluid-experimental/get-container";

import { ContactCollectionContainerRuntimeFactory } from "./containerCode";
import { IContact, IContactCollection } from "./dataObject";
import { renderContact, renderContactCollection } from "./view";

// In interacting with the service, we need to be explicit about whether we're creating a new document vs. loading
// an existing one.  We also need to provide the unique ID for the document we are creating or loading from.

// In this app, we'll choose to create a new document when navigating directly to http://localhost:8080.  For the ID,
// we'll choose to use the current timestamp.  We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:8080/#1596520748752.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
let createNew = false;
if (location.hash.length === 0) {
    createNew = true;
    location.hash = Date.now().toString();
}
const documentId = location.hash.substring(1);
document.title = documentId;

const searchParams = new URLSearchParams(location.search);
const specifiedContact = searchParams.get("contact") ?? undefined;

const getContactUrl = (contactId: string): string => {
    const contactUrl = new URL(location.toString());
    contactUrl.search = `?contact=${contactId}`;
    return contactUrl.toString();
};

async function start(): Promise<void> {
    // The getTinyliciousContainer helper function facilitates loading our container code into a Container and
    // connecting to a locally-running test service called Tinylicious.  This will look different when moving to a
    // production service, but ultimately we'll still be getting a reference to a Container object.  The helper
    // function takes the ID of the document we're creating or loading, the container code to load into it, and a
    // flag to specify whether we're creating a new document or loading an existing one.
    const container = await getTinyliciousContainer(documentId, ContactCollectionContainerRuntimeFactory, createNew);

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
