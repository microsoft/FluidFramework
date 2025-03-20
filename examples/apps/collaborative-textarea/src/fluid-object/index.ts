/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedString, type ISharedString } from "@fluidframework/sequence/legacy";

/**
 * CollaborativeText uses the React CollaborativeTextArea to load a collaborative HTML <textarea>
 * @internal
 */
export class CollaborativeText extends DataObject {
	private readonly textKey = "textKey";

	private _text: SharedString | undefined;
	public get text(): ISharedString {
		if (this._text === undefined) {
			throw new Error("The SharedString was not initialized correctly");
		}
		return this._text;
	}

	public static readonly Name = "@fluid-example/collaborative-textarea";

	private static readonly factory = new DataObjectFactory(
		CollaborativeText.Name,
		CollaborativeText,
		[SharedString.getFactory()],
		{},
	);

	public static getFactory(): DataObjectFactory<CollaborativeText> {
		return this.factory;
	}

	protected async initializingFirstTime(): Promise<void> {
		// Create the SharedString and store the handle in our root SharedDirectory
		const text = SharedString.create(this.runtime);
		this.root.set(this.textKey, text.handle);
	}

	protected async hasInitialized(): Promise<void> {
		// Store the text if we are loading the first time or loading from existing
		this._text = await this.root.get<IFluidHandle<SharedString>>(this.textKey)?.get();
	}
}
