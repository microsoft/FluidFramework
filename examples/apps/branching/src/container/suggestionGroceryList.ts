/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEventProvider } from "@fluidframework/core-interfaces";
import { v4 as uuid } from "uuid";

import { getChangesFromHealthBot } from "./getChangesFromHealthBot.js";
import type { IGroceryItem, IGroceryList } from "./groceryList/index.js";
import type {
	ISuggestionGroceryItem,
	ISuggestionGroceryList,
	ISuggestionGroceryListEvents,
	SuggestionState,
} from "./interfaces.js";

/**
 * GroceryItem is the local object with a friendly interface for the view to use.
 * It conceals the DDS manipulation and access, and exposes a more-convenient surface
 * for working with a single item.
 */
class SuggestionGroceryItem implements ISuggestionGroceryItem {
	public constructor(
		public readonly id: string,
		public readonly name: string,
		public suggestion: SuggestionState,
		public readonly removeItem: () => void,
	) {}
}

export class SuggestionGroceryList implements ISuggestionGroceryList {
	private readonly _suggestionGroceryItems = new Map<string, SuggestionGroceryItem>();
	private _inStagingMode = false;
	public get inStagingMode() {
		return this._inStagingMode;
	}

	private _disposed = false;

	public get disposed(): boolean {
		return this._disposed;
	}

	private readonly _events = new TypedEventEmitter<ISuggestionGroceryListEvents>();
	public get events(): IEventProvider<ISuggestionGroceryListEvents> {
		return this._events;
	}

	public constructor(private readonly groceryList: IGroceryList) {
		if (this.groceryList.disposed) {
			this.dispose();
		} else {
			this.groceryList.events.once("disposed", this.dispose);
			this.groceryList.events.on("itemAdded", this.onItemAdded);
			this.groceryList.events.on("itemRemoved", this.onItemRemoved);

			for (const preExistingGroceryItem of this.groceryList.getItems()) {
				const preExistingSuggestionGroceryItem = new SuggestionGroceryItem(
					preExistingGroceryItem.id,
					preExistingGroceryItem.name,
					"none",
					() => {
						this.removeItem(preExistingSuggestionGroceryItem.id);
					},
				);
				this._suggestionGroceryItems.set(
					preExistingSuggestionGroceryItem.id,
					preExistingSuggestionGroceryItem,
				);
			}
		}
	}

	public readonly addItem = (name: string) => {
		if (this._inStagingMode) {
			// Use timestamp as a hack for a consistent sortable order.  Prefixed with 'z' to sort last.
			const suggestedAddition = new SuggestionGroceryItem(
				`z${Date.now()}-${uuid()}`,
				name,
				"add",
				() => {
					this.removeItem(suggestedAddition.id);
				},
			);
			this._suggestionGroceryItems.set(suggestedAddition.id, suggestedAddition);
			this._events.emit("itemAdded", suggestedAddition);
		} else {
			this.groceryList.addItem(name);
		}
	};

	public readonly getItems = (): ISuggestionGroceryItem[] => {
		return [...this._suggestionGroceryItems.values()];
	};

	public readonly removeItem = (id: string) => {
		if (this._inStagingMode) {
			const suggestedRemoval = this._suggestionGroceryItems.get(id);
			if (suggestedRemoval !== undefined) {
				if (suggestedRemoval.suggestion === "add") {
					this._suggestionGroceryItems.delete(id);
					this._events.emit("itemRemoved", suggestedRemoval);
				} else if (suggestedRemoval.suggestion === "none") {
					suggestedRemoval.suggestion = "remove";
					this._events.emit("itemSuggestionChanged", suggestedRemoval);
				}
			}
		} else {
			this.groceryList.removeItem(id);
		}
	};

	public readonly getSuggestions = () => {
		const asyncGetSuggestions = async () => {
			const { adds, removals } = await getChangesFromHealthBot(this.groceryList);
			for (const add of adds) {
				this.addItem(add.name);
			}
			for (const removal of removals) {
				this.removeItem(removal.id);
			}
		};
		this._inStagingMode = true;
		this._events.emit("enterStagingMode");
		asyncGetSuggestions().catch(console.error);
	};

	public readonly acceptSuggestions = () => {
		const adds = [...this._suggestionGroceryItems.values()].filter(
			(item) => item.suggestion === "add",
		);
		const removals = [...this._suggestionGroceryItems.values()].filter(
			(item) => item.suggestion === "remove",
		);
		// Remove the draft adds, as they will be replaced by real items getting added
		for (const add of adds) {
			add.removeItem();
		}
		this._inStagingMode = false;
		for (const add of adds) {
			this.addItem(add.name);
		}
		for (const removal of removals) {
			removal.removeItem();
		}
		this._events.emit("leaveStagingMode");
	};

	public readonly rejectSuggestions = () => {
		for (const item of this._suggestionGroceryItems.values()) {
			if (item.suggestion === "add") {
				item.removeItem();
			} else if (item.suggestion === "remove") {
				item.suggestion = "none";
				this._events.emit("itemSuggestionChanged", item);
			}
		}
		this._inStagingMode = false;
		this._events.emit("leaveStagingMode");
	};

	private readonly onItemAdded = (item: IGroceryItem) => {
		const addedItem = new SuggestionGroceryItem(item.id, item.name, "none", () => {
			this.removeItem(addedItem.id);
		});
		this._suggestionGroceryItems.set(addedItem.id, addedItem);
		this._events.emit("itemAdded", addedItem);
	};

	private readonly onItemRemoved = (item: IGroceryItem) => {
		const removedItem = this._suggestionGroceryItems.get(item.id);
		this._suggestionGroceryItems.delete(item.id);
		this._events.emit("itemRemoved", removedItem);
	};

	/**
	 * Called when the host container closes and disposes itself
	 */
	private readonly dispose = (): void => {
		this._disposed = true;
		this.groceryList.events.off("itemAdded", this.onItemAdded);
		this.groceryList.events.off("itemRemoved", this.onItemRemoved);
		this._events.emit("disposed");
	};
}
