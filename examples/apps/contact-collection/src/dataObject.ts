/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { v4 as uuid } from "uuid";
import { IEvent } from "@fluidframework/common-definitions";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";

/**
 * IDiceRoller describes the public API surface for our dice roller data object.
 */
export interface IContactCollection extends EventEmitter {
    addContact: (name: string, phone: string) => string;
    removeContact: (id: string) => void;
    getContact: (id: string) => Contact | undefined;
    getContacts: () => Contact[];

    /**
     * The diceRolled event will fire whenever someone rolls the device, either locally or remotely.
     */
    on(event: "diceRolled", listener: () => void): this;
}

// The root is map-like, so we'll use this key for storing the value.
const diceValueKey = "diceValue";

export class Contact {
    constructor(
        private readonly _name: string,
        private readonly _phone: string,
        // setName(), setPhone() ?
    ) { }

    public get name(): string {
        return this._name;
    }

    public get phone(): string {
        return this._phone;
    }
}

/**
 * The DiceRoller is our data object that implements the IDiceRoller interface.
 */
export class ContactCollection extends DataObject implements IContactCollection {
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
            if (changed.key === diceValueKey) {
                // When we see the dice value change, we'll emit the diceRolled event we specified in our interface.
                this.emit("diceRolled");
            }
        });
    }

    public readonly addContact = (name: string, phone: string) => {
        const id = uuid();
        this.root.set(id, { name, phone });
        return id; // ?
    };

    public readonly removeContact = (id: string) => {
        this.root.delete(id);
    };

    public readonly getContact = (id: string) => {
        const contactData = this.root.get(id);
        if (contactData === undefined) {
            return undefined;
        }

        return new Contact(contactData.name, contactData.phone);
    };

    public readonly getContacts = () => {
        const contactList: Contact[] = [];
        for (const contactData of this.root.values()) {
            contactList.push(new Contact(contactData.name, contactData.phone));
        }
        return contactList;
    };
}

/**
 * The DataObjectFactory is used by Fluid Framework to instantiate our DataObject.  We provide it with a unique name
 * and the constructor it will call.  In this scenario, the third and fourth arguments are not used.
 */
export const ContactCollectionInstantiationFactory =
    new DataObjectFactory<ContactCollection, undefined, undefined, IEvent>(
        "contact-collection",
        ContactCollection,
        [],
        {},
    );
