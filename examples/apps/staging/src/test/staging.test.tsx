/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { render } from "@testing-library/react";
import globalJsdom from "global-jsdom";

import type {
	ISuggestionGroceryItem,
	ISuggestionGroceryList,
	ISuggestionGroceryListEvents,
} from "../container/index.js";
import { AppView } from "../view/index.js";

class MockGroceryList
	extends TypedEventEmitter<ISuggestionGroceryListEvents>
	implements ISuggestionGroceryList
{
	private readonly _items: ISuggestionGroceryItem[] = [];
	public inStagingMode: boolean = false;

	public get events(): IEventProvider<ISuggestionGroceryListEvents> {
		return this;
	}

	public addItem(name: string): void {
		this._items.push({
			id: `item-${this._items.length}`,
			name,
			suggestion: "none",
			removeItem: () => {},
			rejectRemovalSuggestion: () => {},
		});
	}

	public getItems(): ISuggestionGroceryItem[] {
		return [...this._items];
	}

	public removeItem(_id: string): void {}
	public getSuggestions(): void {}
	public acceptSuggestions(): void {}
	public rejectSuggestions(): void {}
}

describe("staging", () => {
	let cleanup: () => void;

	before(() => {
		cleanup = globalJsdom();
	});

	after(() => {
		cleanup();
	});

	it("renders the app title", () => {
		const groceryList = new MockGroceryList();
		const { baseElement } = render(<AppView groceryList={groceryList} />);
		assert.ok(baseElement.textContent?.includes("Groceries!") === true, "Expected app title");
	});

	it("renders Get suggestions button when not in staging mode", () => {
		const groceryList = new MockGroceryList();
		const { baseElement } = render(<AppView groceryList={groceryList} />);
		const buttons = baseElement.querySelectorAll("button");
		const hasGetSuggestions = [...buttons].some(
			(btn) => btn.textContent?.includes("Get suggestions") === true,
		);
		assert.ok(hasGetSuggestions, "Expected 'Get suggestions' button when not in staging mode");
	});

	it("renders Accept/Reject buttons when in staging mode", () => {
		const groceryList = new MockGroceryList();
		groceryList.inStagingMode = true;
		const { baseElement } = render(<AppView groceryList={groceryList} />);
		const buttons = baseElement.querySelectorAll("button");
		const buttonTexts = [...buttons].map((btn) => btn.textContent ?? "");
		assert.ok(
			buttonTexts.some((t) => t.includes("Accept")),
			"Expected Accept button in staging mode",
		);
		assert.ok(
			buttonTexts.some((t) => t.includes("Reject")),
			"Expected Reject button in staging mode",
		);
	});

	it("renders grocery items", () => {
		const groceryList = new MockGroceryList();
		groceryList.addItem("apple");
		groceryList.addItem("banana");
		const { baseElement } = render(<AppView groceryList={groceryList} />);
		assert.ok(
			baseElement.textContent?.includes("apple") === true,
			"Expected apple in item list",
		);
		assert.ok(
			baseElement.textContent?.includes("banana") === true,
			"Expected banana in item list",
		);
	});
});
