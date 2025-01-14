/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";

import { AppState } from "./state.js";

/**
 * @internal
 */
export class Bubblebench extends DataObject {
	public static readonly Name = "@fluid-example/bubblebench-baseline";
	private state?: AppState;

	protected async hasInitialized(): Promise<void> {
		this.state = new AppState(
			/* stageWidth: */ 640,
			/* stageHeight: */ 480,
			/* numBubbles: */ 1,
		);
	}

	public get clientManager(): AppState {
		if (this.state === undefined) {
			throw new Error("App state has not yet been initialized.");
		}
		return this.state;
	}
}

/**
 * The DataObjectFactory declares the Fluid object and defines any additional distributed data structures.
 * To add a SharedSequence, SharedMap, or any other structure, put it in the array below.
 * @internal
 */
export const BubblebenchInstantiationFactory = new DataObjectFactory(
	Bubblebench.Name,
	Bubblebench,
	[],
	{},
);
