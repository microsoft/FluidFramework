/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContactCollection } from "./dataObject";

/**
 * Render an IContactCollection into a given div as a text character, with a button to roll it.
 * @param contactCollection - The Data Object to be rendered
 * @param div - The div to render into
 */
export function renderContactCollection(contactCollection: IContactCollection, div: HTMLDivElement) {
    const contacts = contactCollection.getContacts();
    for (const contact of contacts) {
        const contactDiv = document.createElement("div");
        contactDiv.textContent = `${contact.name}: ${contact.phone}`;
        div.append(contactDiv);
    }
}
