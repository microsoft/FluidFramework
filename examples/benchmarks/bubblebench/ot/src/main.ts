/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { SharedJson1 } from "@fluid-experimental/sharejs-json1";

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { AppState } from "./state";

/**
 * @internal
 */
export class Bubblebench extends DataObject {
	public static readonly Name = "@fluid-example/bubblebench-ot";
	private maybeTree?: SharedJson1 = undefined;
	private maybeAppState?: AppState = undefined;

	protected async initializingFirstTime() {
		const tree = (this.maybeTree = SharedJson1.create(this.runtime));
		const initialTree = { clients: [] };
		// unknown used to workaround recursive Doc type that otherwise results in
		// "Type instantiation is excessively deep and possibly infinite" error.
		tree.replace<unknown, typeof initialTree>([], tree.get(), initialTree);
		this.root.set("tree", this.maybeTree.handle);
	}

	protected async initializingFromExisting() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		this.maybeTree = await this.root.get<IFluidHandle<SharedJson1>>("tree")!.get();
	}

	protected async hasInitialized() {
		this.maybeAppState = new AppState(
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

	private get tree() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.maybeTree!;
	}

	public get appState() {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		return this.maybeAppState!;
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
	[SharedJson1.getFactory()],
	{},
);
