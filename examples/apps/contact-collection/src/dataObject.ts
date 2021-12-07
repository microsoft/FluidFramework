/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IRequest, IResponse } from "@fluidframework/core-interfaces";
import { RequestParser } from "@fluidframework/runtime-utils";

/**
 * IContact describes the public, read-only API surface for a single contact
 */
export interface IContact {
    readonly id: string;
    readonly name: string;
    readonly phone: string;
}

/**
 * IContactCollection describes the public API surface for our contact collection data object.
 */
export interface IContactCollection extends EventEmitter {
    addContact: (name: string, phone: string) => void;
    getContact: (id: string) => IContact | undefined;
    getContacts: () => IContact[];

    /**
     * The contactCollectionChanged event will fire whenever the list changes, either locally or remotely.
     */
    on(event: "contactCollectionChanged", listener: () => void): this;
}

export class Contact implements IContact {
    constructor(
        private readonly _id: string,
        private readonly _name: string,
        private readonly _phone: string,
    ) { }

    public get id(): string {
        return this._id;
    }

    public get name(): string {
        return this._name;
    }

    public get phone(): string {
        return this._phone;
    }
}

/**
 * The ContactCollection is our data object that implements the IContactCollection interface.
 */
export class ContactCollection extends DataObject implements IContactCollection {
    // The key feature of the collection pattern is its request handling.  Most data objects will respond to a
    // request of "/" to return themselves, but the collection pattern will additionally respond to subrequests
    // to return specific members of the collection instead.  Here we interpret the url to be of the form
    // "/<contactId>" and get the corresponding Contact to return.
    public async request(request: IRequest): Promise<IResponse> {
        const requestParser = RequestParser.create(request);
        // We interpret the first path part as the id of the contact that we should retrieve
        if (requestParser.pathParts.length === 1) {
            const contact = this.getContact(requestParser.pathParts[0]);
            return { mimeType: "fluid/object", status: 200, value: contact };
        }
        // Otherwise we'll return the collection itself
        return super.request(request);
    }

    /**
     * initializingFirstTime is run only once by the first client to create the DataObject.  Here we use it to
     * initialize the state of the DataObject.
     */
    protected async initializingFirstTime() {
        this.addContact("Alice", "555-1234");
        this.addContact("Bob", "555-5678");
        this.addContact("Carol", "555-9999");
    }

    /**
     * hasInitialized is run by each client as they load the DataObject.  Here we use it to set up usage of the
     * DataObject, by registering an event listener for changes to the contact list.
     */
    protected async hasInitialized() {
        this.root.on("valueChanged", (changed) => {
            // When we see the contacts change, we'll emit the contactCollectionChanged event we specified
            // in our interface.
            this.emit("contactCollectionChanged");
        });
    }

    public readonly addContact = (name: string, phone: string) => {
        const id = uuid();
        this.root.set(id, { name, phone });
    };

    public readonly getContact = (id: string): IContact | undefined => {
        const contactData = this.root.get(id);
        if (contactData === undefined) {
            return undefined;
        }

        return new Contact(id, contactData.name, contactData.phone);
    };

    public readonly getContacts = () => {
        const contactList: IContact[] = [];
        for (const [id, contactData] of this.root) {
            contactList.push(new Contact(id, contactData.name, contactData.phone));
        }
        return contactList;
    };
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const ContactCollectionInstantiationFactory =
    new DataObjectFactory(
        "contact-collection",
        ContactCollection,
        [],
        {},
    );
