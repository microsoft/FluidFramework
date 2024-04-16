/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Lint rule can be disabled once eslint config is upgraded to 5.3.0+
// eslint-disable-next-line import/no-internal-modules
import { DataObject } from "@fluidframework/aqueduct/internal";
import { IFluidHandle, type IFluidLoadable } from "@fluidframework/core-interfaces";
import { IChannelFactory } from "@fluidframework/datastore-definitions";
import {
	configuredSharedTree,
	typeboxValidator,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/internal";
import {
	type DataObjectClass,
	ITree,
	type ImplicitFieldSchema,
	SchemaIncompatible,
	TreeConfiguration,
	TreeFieldFromImplicitField,
	TreeView,
} from "fluid-framework";
import * as React from "react";

/**
 * This file contains logic not specific to this particular sample that other apps may want to use.
 * Eventually this should be published as part of a package apps can use.
 */

/**
 * Opt into extra validation to detect encoding bugs and data corruption.
 */
const SharedTree = configuredSharedTree({
	jsonValidator: typeboxValidator,
});

/**
 * TODO: once we add options to factory (for example controlling the write format),
 * apps will need a way to provide those.
 */
export const factory: IChannelFactory = SharedTree.getFactory();

/**
 * Object with the required recursive type to be used to mark DataObjectClasses.
 * Note that this probably doesn't work when exported to a package API as it will likely infer `any`.
 * TODO: Simplify DataObjectClasses to avoid needing this.
 */
const dataObjectFactoryMarker = {
	get IFluidDataStoreFactory(): typeof dataObjectFactoryMarker {
		return this;
	},
};

/**
 * Defines a DataObject for a {@link @fluidframework/tree#SharedTree} with a built in {@link @fluidframework/tree#TreeConfiguration}.
 * @param key - See {@link ITreeDataObject.key}.
 * @param treeConfiguration - See {@link ITreeDataObject.config}.
 * @returns A {@link @fluidframework/fluid-static#DataObjectClass} to allow easy use of a SharedTree in a ContainerSchema
 */
export function treeDataObject<TSchema extends ImplicitFieldSchema>(
	key: string,
	treeConfiguration: TreeConfiguration<TSchema>,
): DataObjectClass<ITreeDataObject<TSchema> & IFluidLoadable> {
	return class InventoryList extends TreeDataObject<TSchema> {
		public readonly key = key;
		public readonly config = treeConfiguration;
	};
}

export interface ITreeDataObject<TSchema extends ImplicitFieldSchema> {
	/**
	 * The key under the root DataObject in which the {@link @fluidframework/tree#SharedTree} is stored.
	 */
	readonly key: string;

	/**
	 * TreeConfiguration used to initialize new documents, as well as to interpret (schematize) existing ones.
	 *
	 * @remarks
	 * The fact that a single view schema is provided here (on the data object) makes it impossible to try and apply multiple different schema.
	 * Since the view schema currently does not provide any adapters for handling differences between view and stored schema,
	 * its also impossible for this single view schema to handle multiple different stored schema.
	 * Therefor, with this current API, two different applications (or different versions of the same application)
	 * with differing stored schema requirements (as implied by their view schema) can not collaborate on the same tree.
	 * The only schema evolution thats currently possible is upgrading the schema to one that supports a superset of what the old schema allowed,
	 * and collaborating between clients which have view schema that exactly correspond to that stored schema.
	 * Future work on tree as well as these utilities should address this limitation.
	 */
	readonly config: TreeConfiguration<TSchema>;

	/**
	 * React component which handles schematizing trees.
	 * This includes displaying errors when the document can not be schematized.
	 *
	 * @privateRemarks
	 * This is exposed as a member rather than a free function since type inference for the schema doesn't work when used as a free function,
	 * and thus making it a member avoids the user of this from having to explicitly provide the type parameter.
	 * This is an arrow function not a method so it gets the correct this when not called as a member.
	 */
	readonly TreeViewComponent: ({
		viewComponent,
	}: {
		viewComponent: React.FC<{ root: TreeFieldFromImplicitField<TSchema> }>;
	}) => React.JSX.Element;
}

/**
 * Generic DataObject for shared trees.
 */
export abstract class TreeDataObject<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema>
	extends DataObject
	implements ITreeDataObject<TSchema>
{
	public static readonly factory = dataObjectFactoryMarker;

	#tree?: TreeView<TSchema>;

	public get tree(): TreeView<TSchema> {
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

	public abstract readonly key: string;

	public abstract readonly config: TreeConfiguration<TSchema>;

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
	errorComponent,
}: {
	tree: TreeDataObject<TSchema>;
	viewComponent: React.FC<{ root: TreeFieldFromImplicitField<TSchema> }>;
	errorComponent?: React.FC<{
		error: SchemaIncompatible;
		upgradeSchema: () => void;
	}>;
}) {
	const view = tree.tree;

	const [error, setError] = React.useState<null | SchemaIncompatible>(null);
	const [root, setRoot] = React.useState<null | TreeFieldFromImplicitField<TSchema>>(null);

	React.useEffect(() => {
		let ignore = false;

		const update = () => {
			if (!ignore) {
				if (view.error !== undefined) {
					setError(view.error);
					setRoot(null);
				} else {
					setError(null);
					setRoot(view.root);
				}
			}
		};

		update();
		view.events.on("rootChanged", update);

		return () => {
			ignore = true;
			// View is owned by tree so its not disposed here.
		};
	}, [view]);

	if (error !== null) {
		return React.createElement(errorComponent ?? TreeErrorComponent, {
			error,
			upgradeSchema: () => view.upgradeSchema(),
		});
	}

	if (root === null) {
		return <div>View not set</div>;
	}

	return React.createElement(viewComponent, { root });
}

/**
 * React component which displays schema errors and allows upgrading schema when possible.
 */
function TreeErrorComponent({
	error,
	upgradeSchema,
}: {
	error: SchemaIncompatible;
	upgradeSchema: () => void;
}) {
	// eslint-disable-next-line unicorn/prefer-ternary
	if (error.canUpgrade) {
		return (
			<div>
				<div>
					Document is incompatible with current version of the application, but the
					document format can be updated. This may prevent other versions of the
					application from opening this document.
				</div>
				<button onClick={() => upgradeSchema()}>Upgrade</button>;
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
