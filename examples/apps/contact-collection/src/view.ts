/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContact, IContactCollection } from "./dataObject.js";

function makeContactDiv(contact: IContact): HTMLDivElement {
	const contactDiv = document.createElement("div");
	contactDiv.textContent = `${contact.name}: ${contact.phone}`;
	return contactDiv;
}

const profilePictures = [
	"👩",
	"👨",
	"🧑",
	"👧",
	"👦",
	"🧒",
	"👶",
	"👵",
	"👴",
	"🧓",
	"👩‍🦰",
	"👨‍🦰",
	"👩‍🦱",
	"👨‍🦱",
	"👩‍🦲",
	"👨‍🦲",
	"👩‍🦳",
	"👨‍🦳",
	"👱‍♀️",
	"👱‍♂️",
	"👽",
];

/**
 * Render an IContact into a given div with a random emoji as a profile picture
 * @param contact - the IContact to render details for
 * @param div - The div to render into
 */
export function renderContact(contact: IContact, div: HTMLDivElement): void {
	const contactDiv = makeContactDiv(contact);
	const profilePic = document.createElement("div");
	profilePic.style.fontSize = "50px";
	// Really the profile picture should come from the contact, but this is just for fun :)
	profilePic.textContent = profilePictures[Math.floor(Math.random() * profilePictures.length)];
	div.append(contactDiv, profilePic);
}

/**
 * Render an IContactCollection into a given div plus UX to add new contacts.  Clicking on the contacts opens a
 * details view.
 * @param contactCollection - The Data Object to be rendered
 * @param getContactUrl - A helper function that generates absolute URLs for a given contact ID
 * @param div - The div to render into
 */
export function renderContactCollection(
	contactCollection: IContactCollection,
	getContactUrl: (contactId: string) => string,
	div: HTMLDivElement,
): void {
	const contactListDiv = document.createElement("div");

	// Render the contact list.  Since we'll want to re-render every time the contacts change, we'll
	// use a function that we can register to listen to the event.
	const renderContactList = (): void => {
		contactListDiv.innerHTML = "";
		const contacts = contactCollection.getContacts();
		for (const contact of contacts) {
			const contactDiv = makeContactDiv(contact);
			const contactUrl = getContactUrl(contact.id);
			contactDiv.addEventListener("click", () => {
				window.open(contactUrl, "ContactDetailsWindow", "width=400,height=400");
			});
			contactListDiv.append(contactDiv);
		}
	};
	renderContactList();
	contactCollection.on("contactCollectionChanged", renderContactList);

	// UX for adding contacts
	const addContactDiv = document.createElement("div");
	const nameInput = document.createElement("input");
	nameInput.placeholder = "Name";
	const phoneInput = document.createElement("input");
	phoneInput.placeholder = "Phone";
	const addButton = document.createElement("button");
	addButton.textContent = "Add";
	addButton.addEventListener("click", () => {
		const name = nameInput.value;
		const phone = phoneInput.value;
		contactCollection.addContact(name, phone);
		nameInput.value = "";
		phoneInput.value = "";
	});
	addContactDiv.append(nameInput, phoneInput, addButton);

	div.append(contactListDiv, addContactDiv);
}
