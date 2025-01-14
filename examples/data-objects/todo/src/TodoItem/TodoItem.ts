/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IValueChanged } from "@fluidframework/map/legacy";
import { SharedString } from "@fluidframework/sequence/legacy";

export interface ITodoItemInitialState {
	startingText: string;
}

const textKey = "text";
const detailedTextKey = "detailedText";
const checkedKey = "checked";

/**
 * Todo Item is a singular todo entry consisting of:
 * - SharedString for the item's text
 * - SharedString for the item's detailed text
 * - Boolean stored in the root SharedDirectory for the checkbox
 */
export class TodoItem extends DataObject<{ InitialState: ITodoItemInitialState }> {
	private _text: SharedString | undefined;
	private get text(): SharedString {
		if (this._text === undefined) {
			throw new Error("Attempted to access text before initialized");
		}
		return this._text;
	}
	private _detailedText: SharedString | undefined;
	private get detailedText(): SharedString {
		if (this._detailedText === undefined) {
			throw new Error("Attempted to access detailedText before initialized");
		}
		return this._detailedText;
	}

	protected async initializingFirstTime(initialState?: ITodoItemInitialState) {
		// The text of the todo item, with initial value if it was provided
		const newItemText = initialState?.startingText ?? "New Item";
		const text = SharedString.create(this.runtime);
		text.insertText(0, newItemText);
		this.root.set(textKey, text.handle);

		// The detailed text of the todo item
		const detailedText = SharedString.create(this.runtime);
		this.root.set(detailedTextKey, detailedText.handle);

		// The state of the checkbox
		this.root.set(checkedKey, false);
	}

	protected async hasInitialized() {
		const textHandle = this.root.get<IFluidHandle<SharedString>>(textKey);
		if (textHandle === undefined) {
			throw new Error("Text SharedString missing");
		}
		const textP = textHandle.get();

		const detailedTextHandle = this.root.get<IFluidHandle<SharedString>>(detailedTextKey);
		if (detailedTextHandle === undefined) {
			throw new Error("Detailed text SharedString missing");
		}
		const detailedTextP = detailedTextHandle.get();

		[this._text, this._detailedText] = await Promise.all([textP, detailedTextP]);

		this.root.on("valueChanged", (changed: IValueChanged, local: boolean) => {
			if (!local) {
				if (changed.key === checkedKey) {
					this.emit("checkedStateChanged");
				}
			}
		});
	}

	// start public API surface for the TodoItem model, used by the view

	// Would prefer not to hand this out, and instead give back an object?
	public getText() {
		return this.text;
	}

	// Would prefer not to hand this out, and instead give back an object?
	public getDetailedText(): SharedString {
		return this.detailedText;
	}

	public getCheckedState(): boolean {
		const checkedState: boolean | undefined = this.root.get(checkedKey);
		if (checkedState === undefined) {
			throw new Error("Checked state missing");
		}
		return checkedState;
	}

	public setCheckedState(newState: boolean): void {
		this.root.set(checkedKey, newState);
		this.emit("checkedStateChanged");
	}

	// end public API surface for the TodoItem model, used by the view
}

export const TodoItemFactory = new DataObjectFactory(
	"@fluid-example/todo-item",
	TodoItem,
	[SharedString.getFactory()],
	{},
);
