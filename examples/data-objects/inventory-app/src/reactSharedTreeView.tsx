/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
	TreeNodeSchema,
	TreeConfiguration,
	ITree,
	TreeFieldFromImplicitField,
	TreeView,
	disposeSymbol,
	SchemaIncompatible,
	SharedTree,
} from "@fluidframework/tree";
import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IChannelFactory } from "@fluidframework/datastore-definitions";

/**
 * This file contains logic not specific to this particular sample that other apps may want to use.
 * Eventually this should be published as part of a package apps can use.
 */

/**
 * TODO: once we add options to factory (for example controlling the write format),
 * apps will need a way to provide those.
 */
export const factory: IChannelFactory = SharedTree.getFactory();

/**
 * Generic DataObject for shared trees.
 */
export abstract class TreeDataObject extends DataObject {
	#tree?: ITree;

	public get tree(): ITree {
		if (this.#tree === undefined)
			throw new Error("view should be initialized by hasInitialized");
		return this.#tree;
	}

	protected async initializingFirstTime() {
		this.#tree = this.runtime.createChannel(undefined, factory.type) as ITree;
		this.root.set(this.key, this.#tree.handle);
	}

	protected async initializingFromExisting() {
		const handle = this.root.get<IFluidHandle<ITree>>(this.key);
		if (handle === undefined)
			throw new Error("map should be populated on creation by 'initializingFirstTime'");
		this.#tree = await handle.get();
	}

	protected async hasInitialized() {
		if (this.#tree === undefined)
			throw new Error("tree should be initialized by initializing* methods");
	}

	public abstract key: string;
}

/**
 * React component which handles schematizing trees.
 * This includes displaying errors when the document can not be schematized.
 */
export function TreeViewComponent<TSchema extends TreeNodeSchema>({
	tree,
	config,
	viewComponent,
}: {
	tree: ITree;
	config: TreeConfiguration<TSchema>;
	viewComponent: React.FC<{ root: TreeFieldFromImplicitField<TSchema> }>;
}) {
	const [view, setView] = React.useState<null | TreeView<TreeFieldFromImplicitField<TSchema>>>(
		null,
	);

	const [error, setError] = React.useState<null | SchemaIncompatible>(null);

	const [root, setRoot] = React.useState<null | TreeFieldFromImplicitField<TSchema>>(null);

	React.useEffect(() => {
		let ignore = false;
		const innerView = tree.schematize(config);
		// TODO: how to invalidate if schema goes from incompatible -> compatible?

		const update = () => {
			if (!ignore) {
				if (innerView.error) {
					setError(innerView.error);
					setRoot(null);
				} else {
					setError(null);
					setRoot(innerView.root);
				}
			}
		};

		update();
		innerView.events.on("rootChanged", update);
		setView(innerView);

		return () => {
			ignore = true;
			innerView?.[disposeSymbol]();
		};
	}, [tree, config]);

	if (error !== null) {
		if (error.canUpgrade) {
			return (
				<div>
					<div>
						Document is incompatible with current version of the application, but the
						document format can be updated. This may prevent other versions of the
						application from opening this document.
					</div>
					<button onClick={() => view?.upgradeSchema()}>Upgrade</button>;
				</div>
			);
		} else {
			return (
				<div>
					Document is incompatible with current version of the application, and the document
					format cannot be updated. The document is likely from a newer or otherwise
					incompatible version of the application, or a different application.
				</div>
			);
		}
	}

	if (root === null) {
		return <div>View not set</div>;
	}

	return React.createElement(viewComponent, { root });
}
