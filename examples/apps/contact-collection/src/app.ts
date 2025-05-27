/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StaticCodeLoader, TinyliciousModelLoader } from "@fluid-example/example-utils";

import {
	ContactCollectionContainerRuntimeFactory,
	IContactCollectionAppModel,
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
	const tinyliciousModelLoader = new TinyliciousModelLoader<IContactCollectionAppModel>(
		new StaticCodeLoader(new ContactCollectionContainerRuntimeFactory()),
	);

	let id: string;
	let model: IContactCollectionAppModel;

	if (location.hash.length === 0) {
		// Normally our code loader is expected to match up with the version passed here.
		// But since we're using a StaticCodeLoader that always loads the same runtime factory regardless,
		// the version doesn't actually matter.
		const createResponse = await tinyliciousModelLoader.createDetached("1.0");
		model = createResponse.model;
		id = await createResponse.attach();
	} else {
		id = location.hash.slice(1);
		model = await tinyliciousModelLoader.loadExisting(id);
	}

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

try {
	await start();
} catch (error) {
	console.error(error);
}
