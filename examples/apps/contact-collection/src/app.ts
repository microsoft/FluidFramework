/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createExampleDriver,
	getSpecifiedServiceFromWebpack,
} from "@fluid-example/example-driver";
import { StaticCodeLoader } from "@fluid-example/example-utils";
import type { IContainer } from "@fluidframework/container-definitions/legacy";
import {
	createDetachedContainer,
	loadExistingContainer,
} from "@fluidframework/container-loader/legacy";

import {
	ContactCollectionContainerRuntimeFactory,
	type IContactCollectionAppModel,
} from "./containerCode.js";
import { renderContact, renderContactCollection } from "./view.js";

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
	const service = getSpecifiedServiceFromWebpack();
	const {
		urlResolver,
		documentServiceFactory,
		createCreateNewRequest,
		createLoadExistingRequest,
	} = await createExampleDriver(service);

	const codeLoader = new StaticCodeLoader(new ContactCollectionContainerRuntimeFactory());

	let id: string;
	let container: IContainer;

	if (location.hash.length === 0) {
		// Some services support or require specifying the container id at attach time (local, odsp). For
		// services that do not (t9s), the passed id will be ignored.
		id = Date.now().toString();
		const createNewRequest = createCreateNewRequest(id);
		container = await createDetachedContainer({
			codeDetails: { package: "1.0" },
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
		await container.attach(createNewRequest);
		// For most services, the id on the resolvedUrl is the authoritative source for the container id
		// (regardless of whether the id passed in createCreateNewRequest is respected or not). However,
		// for odsp the id is a hashed combination of drive and container ID which we can't use. Instead,
		// we retain the id we generated above.
		if (service !== "odsp") {
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url unexpectedly missing!");
			}
			id = container.resolvedUrl.id;
		}
	} else {
		id = location.hash.slice(1);
		container = await loadExistingContainer({
			request: await createLoadExistingRequest(id),
			urlResolver,
			documentServiceFactory,
			codeLoader,
		});
	}

	// Get the model from the container
	const model = (await container.getEntryPoint()) as IContactCollectionAppModel;

	// update the browser URL and the window title with the actual container ID
	// eslint-disable-next-line require-atomic-updates
	location.hash = id;
	document.title = id;

	// Render it
	const contentDiv = document.querySelector("#content") as HTMLDivElement;

	// Our app has two rendering modes, contact list and single contact details view.  The app owns the url format,
	// and here we've chosen to use the query params to pass the single contact id if that's the view we want (notice
	// that getContactUrl generates urls of this format).  Alternate implementations might use the URL path or other
	// routing strategies to specify the view to use -- it's all up to the app.
	if (specifiedContact === undefined) {
		// If a contact was not specified, we'll render the full collection.
		const contactCollection = model.contactCollection;
		renderContactCollection(contactCollection, getContactUrl, contentDiv);
	} else {
		// If a contact was specified, we'll render just that contact.
		const contact = model.contactCollection.getContact(specifiedContact);
		if (contact === undefined) {
			throw new Error("Contact not found");
		}
		renderContact(contact, contentDiv);
	}
}

await start();
