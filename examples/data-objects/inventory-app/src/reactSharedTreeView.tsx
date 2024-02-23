/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
	TreeConfiguration,
	ITree,
	TreeFieldFromImplicitField,
	TreeView,
	disposeSymbol,
	SchemaIncompatible,
	SharedTree,
	type ImplicitFieldSchema,
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
export abstract class TreeDataObject<
	TSchema extends ImplicitFieldSchema = ImplicitFieldSchema,
> extends DataObject {
	#tree?: TreeView<TreeFieldFromImplicitField<TSchema>>;

	public get tree(): TreeView<TreeFieldFromImplicitField<TSchema>> {
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
		return this.#tree;
	}

	protected async initializingFirstTime() {
		const tree = this.runtime.createChannel(undefined, factory.type) as ITree;
		this.#tree = tree.schematize(this.config);
		// Initialize the tree content and schema.
		this.#tree.upgradeSchema();
		this.root.set(this.key, tree.handle);
	}

	protected async initializingFromExisting() {
		const handle = this.root.get<IFluidHandle<ITree>>(this.key);
		if (handle === undefined)
			throw new Error("map should be populated on creation by 'initializingFirstTime'");
		// If the tree is incompatible with the config's schema,
		// the TreeView exposes an error which is explicitly handled by TreeViewComponent.
		this.#tree = (await handle.get()).schematize(this.config);
	}

	protected async hasInitialized() {
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
	}

	public abstract key: string;
	public abstract config: TreeConfiguration<TSchema>;

	/**
	 * React component which handles schematizing trees.
	 * This includes displaying errors when the document can not be schematized.
	 *
	 * @privateRemarks
	 * This is exposed as a member rather than a free function since type inference for the schema doesn't work when used as a free function,
	 * and thus making it a member avoids the user of this from having to explicitly provide the type parameter.
	 * This is an arrow function not a method so it gets the correct this when not called as a member.
	 */
	public readonly TreeViewComponent = ({
		viewComponent,
	}: {
		viewComponent: React.FC<{ root: TreeFieldFromImplicitField<TSchema> }>;
	}) =>
		TreeViewComponent<TSchema>({
			tree: this,
			viewComponent,
		});
}

/**
 * React component which handles schematizing trees.
 * This includes displaying errors when the document can not be schematized.
 */
function TreeViewComponent<TSchema extends ImplicitFieldSchema>({
	tree,
	viewComponent,
}: {
	tree: TreeDataObject<TSchema>;
	viewComponent: React.FC<{ root: TreeFieldFromImplicitField<TSchema> }>;
}) {
	const [view, setView] = React.useState<null | TreeView<TreeFieldFromImplicitField<TSchema>>>(
		null,
	);

	const [error, setError] = React.useState<null | SchemaIncompatible>(null);

	const [root, setRoot] = React.useState<null | TreeFieldFromImplicitField<TSchema>>(null);

	React.useEffect(() => {
		let ignore = false;
		const innerView = tree.tree;
		// TODO: how to invalidate if schema goes from incompatible -> compatible?

		const update = () => {
			if (!ignore) {
				if (tree.tree.error !== undefined) {
					setError(tree.tree.error);
					setRoot(null);
				} else {
					setError(null);
					setRoot(tree.tree.root);
				}
			}
		};

		update();
		innerView.events.on("rootChanged", update);
		setView(tree.tree);

		return () => {
			ignore = true;
			tree.tree?.[disposeSymbol]();
		};
	}, [tree]);

	if (error !== null) {
		// eslint-disable-next-line unicorn/prefer-ternary
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
					Document is incompatible with current version of the application, and the
					document format cannot be updated. The document is likely from a newer or
					otherwise incompatible version of the application, or a different application.
				</div>
			);
		}
	}

	if (root === null) {
		return <div>View not set</div>;
	}

	return React.createElement(viewComponent, { root });
}
