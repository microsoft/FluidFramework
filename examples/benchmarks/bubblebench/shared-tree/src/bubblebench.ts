/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/legacy";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { ITree, type TreeView } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

import { AppState } from "./appState.js";
import { type App, appTreeConfiguration } from "./schema.js";

// Key used to store/retrieve the SharedTree instance within the root SharedMap.
const treeKey = "treeKey";

export class Bubblebench extends DataObject {
	public static readonly Name = "@fluid-example/bubblebench-simpletree";

	private view: TreeView<typeof App> | undefined;
	private _appState: AppState | undefined;

	protected async initializingFirstTime() {
		const tree = SharedTree.create(this.runtime);

		this.view = tree.viewWith(appTreeConfiguration);
		this.view.initialize({ clients: [] });
		this.root.set(treeKey, tree.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const tree = await this.root.get<IFluidHandle<ITree>>(treeKey)!.get();
		this.view = tree.viewWith(appTreeConfiguration);
	}

	protected async hasInitialized() {
		this._appState = new AppState(
			this.tree,
			/* stageWidth: */ 640,
			/* stageHeight: */ 480,
			/* numBubbles: */ 1,
		);

		const onConnected = () => {
			// Out of paranoia, we periodically check to see if your client Id has changed and
			// update the tree if it has.
			setInterval(() => {
				const clientId = this.runtime.clientId;
				if (clientId !== undefined && clientId !== this.appState.localClient.clientId) {
					this.appState.localClient.clientId = clientId;
				}
			}, 1000);
		};

		// Wait for connection to begin checking client Id.
		if (this.runtime.connected) {
			onConnected();
		} else {
			this.runtime.once("connected", onConnected);
		}
	}

	/**
	 * Get the SharedTree.
	 * Cannot be accessed until after initialization has completed.
	 */
	private get tree(): TreeView<typeof App> {
		if (this.view === undefined) throw new Error("not initialized");
		return this.view;
	}

	/**
	 * Get the AppState.
	 * Cannot be accessed until after initialization has completed.
	 */
	public get appState(): AppState {
		if (this._appState === undefined) throw new Error("not initialized");
		return this._appState;
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
	[SharedTree.getFactory()], // This is fine for now  but we will have to adjust this API later to allow control of write format
	{},
);
