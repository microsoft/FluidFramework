/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient } from "@fluidframework/azure-client";
import { InsecureTinyliciousTokenProvider } from "@fluidframework/tinylicious-driver";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import { ISharedTree, SharedTreeFactory, FieldKinds } from "@fluid-internal/tree";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { registerSchemas } from "@fluid-example/schemas";
import { convertPropertyToSharedTreeStorageSchema as convertPSetSchema } from "@fluid-experimental/property-shared-tree-interop";

import { renderApp } from "./editableTreeInspector";
import { getRootFieldSchema, personSchemaName, personPropertyDDSSchemas } from "./demoPersonData";

const { optional } = FieldKinds;

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

// In this app, we'll choose to create a new document when navigating directly to http://localhost:9000.
// We'll also choose to interpret the URL hash as an existing document's
// ID to load from, so the URL for a document load will look something like http://localhost:9000/#ffd990f3-1e72-4f0c-b2ab-b126cc005a5d.
// These policy choices are arbitrary for demo purposes, and can be changed however you'd like.
export async function start(): Promise<void> {
	// Register all schemas.
	// It's important to register schemas before loading an existing document
	// in order to process the changeset.
	registerSchemas(PropertyFactory);
	PropertyFactory.register(Object.values(personPropertyDDSSchemas));

	// when the document ID is not provided, create a new one.
	const shouldCreateNew = location.hash.length === 0;
	const documentId = !shouldCreateNew ? window.location.hash.substring(1) : "";

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
	const fullSchemaData = convertPSetSchema(getRootFieldSchema(optional, personSchemaName));
	sharedTree.storedSchema.update(fullSchemaData);

	renderApp(sharedTree);
}

start().catch((error) => console.error(error));
