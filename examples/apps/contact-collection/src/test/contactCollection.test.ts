/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { EventEmitter } from "@fluid-example/example-utils";
import globalJsdom from "global-jsdom";

import type { IContact, IContactCollection } from "../dataObject.js";
import { Contact } from "../dataObject.js";
import { renderContact, renderContactCollection } from "../view.js";

class MockContactCollection extends EventEmitter implements IContactCollection {
	private readonly contacts: Map<string, IContact> = new Map();

	public addContact(name: string, phone: string): void {
		const id = `id-${this.contacts.size}`;
		this.contacts.set(id, new Contact(id, name, phone));
		this.emit("contactCollectionChanged");
	}

	public getContact(id: string): IContact | undefined {
		return this.contacts.get(id);
	}

	public getContacts(): IContact[] {
		return [...this.contacts.values()];
	}
}

describe("contact-collection", () => {
	let cleanup: () => void;

	before(() => {
		cleanup = globalJsdom();
	});

	after(() => {
		cleanup();
	});

	describe("Contact", () => {
		it("stores name and phone", () => {
			const contact = new Contact("abc", "Alice", "555-1234");
			assert.equal(contact.id, "abc");
			assert.equal(contact.name, "Alice");
			assert.equal(contact.phone, "555-1234");
		});
	});

	describe("renderContact", () => {
		it("renders contact name and phone into a div", () => {
			const contact = new Contact("1", "Bob", "555-5678");
			const div = document.createElement("div");
			renderContact(contact, div);
			assert.ok(
				div.textContent?.includes("Bob") === true,
				"Expected contact name in rendered output",
			);
			assert.ok(
				div.textContent?.includes("555-5678") === true,
				"Expected phone in rendered output",
			);
		});
	});

	describe("renderContactCollection", () => {
		it("renders all contacts", () => {
			const collection = new MockContactCollection();
			collection.addContact("Alice", "555-1234");
			collection.addContact("Bob", "555-5678");

			const div = document.createElement("div");
			renderContactCollection(collection, () => "http://localhost", div);

			assert.ok(
				div.textContent?.includes("Alice") === true,
				"Expected Alice in rendered output",
			);
			assert.ok(div.textContent?.includes("Bob") === true, "Expected Bob in rendered output");
		});

		it("renders an Add button", () => {
			const collection = new MockContactCollection();
			const div = document.createElement("div");
			renderContactCollection(collection, () => "http://localhost", div);

			const buttons = div.querySelectorAll("button");
			const addButton = [...buttons].find((btn) => btn.textContent?.includes("Add") === true);
			assert.ok(addButton, "Expected an Add button");
		});
	});
});
