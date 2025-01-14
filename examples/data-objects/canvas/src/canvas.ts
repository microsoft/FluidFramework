/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IInk, Ink } from "@fluid-experimental/ink";
import { DataObject } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export class Canvas extends DataObject {
	private _ink: IInk | undefined;

	public get ink(): IInk {
		if (this._ink === undefined) {
			throw new Error("Ink should be defined before access");
		}
		return this._ink;
	}

	protected async initializingFirstTime(): Promise<void> {
		this.root.set("ink", Ink.create(this.runtime).handle);
	}

	protected async hasInitialized(): Promise<void> {
		// Wait here for the ink
		const handle = this.root.get<IFluidHandle<IInk>>("ink");
		if (handle === undefined) {
			throw new Error("Canvas improperly initialized");
		}
		this._ink = await handle.get();
	}
}
