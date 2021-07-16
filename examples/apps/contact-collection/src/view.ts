/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContact, IContactCollection } from "./dataObject";

function makeContactDiv(contact: IContact) {
    const contactDiv = document.createElement("div");
    contactDiv.textContent = `${contact.name}: ${contact.phone}`;
    return contactDiv;
}

export function renderContact(contact: IContact, div: HTMLDivElement) {
    const contactDiv = makeContactDiv(contact);
    div.append(contactDiv);
}

/**
 * Render an IContactCollection into a given div as a text character, with a button to roll it.
 * @param contactCollection - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderContactCollection(contactCollection: IContactCollection, div: HTMLDivElement) {
    const contactListDiv = document.createElement("div");

    // Render the contact list.  Since we'll want to re-render every time the contacts change, we'll
    // use a function that we can register to listen to the event.
    const renderContactList = () => {
        contactListDiv.innerHTML = "";
        const contacts = contactCollection.getContacts();
        for (const contact of contacts) {
            const contactDiv = makeContactDiv(contact);
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
