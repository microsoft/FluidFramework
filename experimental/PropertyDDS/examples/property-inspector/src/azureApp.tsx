/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PropertyFactory } from "@fluid-experimental/property-properties";
import { convertPSetSchema, registerSchemas } from "@fluid-experimental/schemas";
import { AzureClient } from "@fluidframework/azure-client";
import { ISharedTree, SharedTreeFactory, fieldKinds } from "@fluid-internal/tree";
import { InsecureTinyliciousTokenProvider } from "@fluidframework/tinylicious-driver";
import { IChannelFactory } from "@fluidframework/datastore-definitions";

import { renderApp } from "./newInspector";
import { getRootFieldSchema, getPerson } from "./demoPersonData";

class MySharedTree {
    public static getFactory(): IChannelFactory {
        return new SharedTreeFactory();
    }

    onDisconnect() {
        console.warn("disconnected");
    }
}

// In interacting with the service, we need to be explicit about whether we're creating a new document vs. loading
// an existing one.  We also need to provide the unique ID for the document we are loading from.

// In this app, we'll choose to create a new document when navigating directly to http://localhost:8080.
// We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:8080/#1596520748752.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
async function start(): Promise<void> {
    // Register all schemas.
    // It's important to register schemas before loading an existing document
    // in order to process the changeset.
    registerSchemas(PropertyFactory);

    // when the document ID is not provided, create a new one.
    const shouldCreateNew = location.hash.length === 0;
    const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

    // // The getTinyliciousContainer helper function facilitates loading our container code into a Container and
    // // connecting to a locally-running test service called Tinylicious.  This will look different when moving to a
    // // production service, but ultimately we'll still be getting a reference to a Container object.  The helper
    // // function takes the ID of the document we're creating or loading, the container code to load into it, and a
    // // flag to specify whether we're creating a new document or loading an existing one.
    // const [container, containerId] = await getTinyliciousContainer(documentId, ContainerFactory, shouldCreateNew);

    const client = new AzureClient({
        connection: {
            type: "local",
            endpoint: "http://localhost:7070",
            tokenProvider: new InsecureTinyliciousTokenProvider(),
        },
    });

    let res;
    let containerId;
    let container;
    if (!documentId) {
        res = await client.createContainer({
            initialObjects: {
                sharedTree: MySharedTree as any,
            },
        });
        container = res.container;
        containerId = await container.attach();
    } else {
        res = await client.getContainer(documentId, {
            initialObjects: {
                sharedTree: MySharedTree as any,
            },
        });
        container = res.container;
        containerId = documentId;
    }

    // update the browser URL and the window title with the actual container ID
    location.hash = containerId;
    document.title = containerId;

    const sharedTree = container.initialObjects.sharedTree as ISharedTree;
    const schema = convertPSetSchema(getRootFieldSchema(fieldKinds.optional));
    sharedTree.storedSchema.update(schema);
    if (!documentId) {
        const person = getPerson(sharedTree.context);
        sharedTree.root = person;
    }

    renderApp(sharedTree, document.getElementById("root")!);
}

start().catch((error) => console.error(error));
