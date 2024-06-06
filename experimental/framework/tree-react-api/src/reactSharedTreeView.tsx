/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-null */

import {
	DataObject,
	DataObjectFactory,
	createDataObjectKind,
} from "@fluidframework/aqueduct/internal";
import type { IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import {
	type ITree,
	type SchemaIncompatible,
	type TreeConfiguration,
	type TreeFieldFromImplicitField,
	type TreeView,
	type ImplicitFieldSchema,
} from "@fluidframework/tree";
import { configuredSharedTree, typeboxValidator } from "@fluidframework/tree/internal";
import * as React from "react";

/**
 * Opt into extra validation to detect encoding bugs and data corruption.
 * As long as this is an experimental package, opting into extra validation (at a small perf and bundle size cost) seems reasonable.
 */
const SharedTree = configuredSharedTree({
	jsonValidator: typeboxValidator,
});

/**
 * Defines a DataObject for a {@link @fluidframework/tree#SharedTree} with a built in {@link @fluidframework/tree#TreeConfiguration}.
 * @param key - See {@link ITreeDataObject.key}.
 * @param treeConfiguration - See {@link ITreeDataObject.config}.
 * @returns A {@link @fluidframework/fluid-static#DataObjectClass} to allow easy use of a SharedTree in a ContainerSchema.
 * @public
 */
export function treeDataObject<TSchema extends ImplicitFieldSchema>(
	key: string,
	treeConfiguration: TreeConfiguration<TSchema>,
): SharedObjectKind<IReactTreeDataObject<TSchema> & IFluidLoadable> {
	return treeDataObjectInternal(key, treeConfiguration);
}

/**
 * Defines a DataObject for a {@link @fluidframework/tree#SharedTree} with a built in {@link @fluidframework/tree#TreeConfiguration}.
 * @param key - See {@link ITreeDataObject.key}.
 * @param treeConfiguration - See {@link ITreeDataObject.config}.
 * @returns A {@link @fluidframework/fluid-static#DataObjectClass} to allow easy use of a SharedTree in a ContainerSchema.
 * @internal
 */
export function treeDataObjectInternal<TSchema extends ImplicitFieldSchema>(
	key: string,
	treeConfiguration: TreeConfiguration<TSchema>,
): SharedObjectKind<IReactTreeDataObject<TSchema> & IFluidLoadable & DataObject> & {
	readonly factory: IFluidDataStoreFactory;
} {
	class SchemaAwareTreeDataObject extends TreeDataObject<TSchema> {
		public readonly key = key;
		public readonly config = treeConfiguration;

		public static readonly factory = new DataObjectFactory(
			`TreeDataObject:${key}`,
			SchemaAwareTreeDataObject,
			[SharedTree.getFactory()],
			{},
		);
	}
	return createDataObjectKind(SchemaAwareTreeDataObject);
}

/**
 * A schema-aware Tree DataObject.
 * @remarks
 * Allows for the Tree's schema to be baked into the container schema.
 * @public
 */
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
	 * The TreeView.
	 */
	readonly tree: TreeView<TSchema>;
}

/**
 * {@link ITreeDataObject} extended with a React Component to view the tree.
 * @public
 */
export interface IReactTreeDataObject<TSchema extends ImplicitFieldSchema>
	extends ITreeDataObject<TSchema> {
	/**
	 * React component which handles schematizing trees.
	 * This includes displaying errors when the document can not be schematized.
	 *
	 * @privateRemarks
	 * This is exposed as a member rather than a free function since type inference for the schema doesn't work when used as a free function,
	 * and thus making it a member avoids the user of this from having to explicitly provide the type parameter.
	 * This is an arrow function not a method so it gets the correct this when not called as a member.
	 */
	readonly TreeViewComponent: (props: TreeViewProps<TSchema>) => React.JSX.Element;
}

/**
 * React props for viewing a tree.
 * @public
 */
export interface TreeViewProps<TSchema extends ImplicitFieldSchema> {
	/**
	 * Component to display the tree content.
	 */
	readonly viewComponent: React.FC<{ root: TreeFieldFromImplicitField<TSchema> }>;
	/**
	 * Component to display instead of the {@link TreeViewProps.viewComponent}
	 * when tree content is not compatible with the {@link @fluidframework/tree#TreeConfiguration}.
	 *
	 * @defaultValue Component which describes the situation (in English) and allows the user to upgrade the schema to match the {@link @fluidframework/tree#TreeConfiguration} if possible.
	 */
	readonly errorComponent?: React.FC<SchemaIncompatibleProps>;
}

/**
 * Generic DataObject for shared trees.
 * @internal
 */
export abstract class TreeDataObject<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema>
	extends DataObject
	implements IReactTreeDataObject<TSchema>
{
	#tree?: TreeView<TSchema>;

	public get tree(): TreeView<TSchema> {
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
		return this.#tree;
	}

	protected override async initializingFirstTime(): Promise<void> {
		const tree = SharedTree.create(this.runtime);
		this.#tree = tree.schematize(this.config);
		// Initialize the tree content and schema.
		this.#tree.upgradeSchema();
		this.root.set(this.key, tree.handle);
	}

	protected override async initializingFromExisting(): Promise<void> {
		const handle = this.root.get<IFluidHandle<ITree>>(this.key);
		if (handle === undefined)
			throw new Error("map should be populated on creation by 'initializingFirstTime'");
		// If the tree is incompatible with the config's schema,
		// the TreeView exposes an error which is explicitly handled by TreeViewComponent.
		const tree = await handle.get();
		this.#tree = tree.schematize(this.config);
	}

	protected override async hasInitialized(): Promise<void> {
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
	}

	public abstract readonly key: string;

	public abstract readonly config: TreeConfiguration<TSchema>;

	// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
	public readonly TreeViewComponent = ({
		viewComponent,
		errorComponent,
	}: TreeViewProps<TSchema>) =>
		TreeViewComponent<TSchema>({
			tree: this,
			viewComponent,
			errorComponent,
		});
}

/**
 * React component which handles schematizing trees.
 * This includes displaying errors when the document can not be schematized.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function TreeViewComponent<TSchema extends ImplicitFieldSchema>({
	tree,
	viewComponent,
	errorComponent,
}: TreeViewProps<TSchema> & {
	tree: TreeDataObject<TSchema>;
}) {
	const view = tree.tree;

	const [error, setError] = React.useState<null | SchemaIncompatible>(null);
	const [root, setRoot] = React.useState<null | TreeFieldFromImplicitField<TSchema>>(null);

	React.useEffect(() => {
		let ignore = false;

		const update = (): void => {
			if (!ignore) {
				if (view.error === undefined) {
					setError(null);
					setRoot(view.root);
				} else {
					setError(view.error);
					setRoot(null);
				}
			}
		};

		update();
		view.events.on("rootChanged", update);

		return (): void => {
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
 * React Props for displaying when the opened document is incompatible with the required view schema.
 * @public
 */
export interface SchemaIncompatibleProps {
	/**
	 * Information about how the schema is incompatible.
	 */
	readonly error: SchemaIncompatible;
	/**
	 * Callback to request that the stored schema in the document be upgraded.
	 */
	readonly upgradeSchema: () => void;
}

/**
 * React component which displays schema errors and allows upgrading schema when possible.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function TreeErrorComponent({ error, upgradeSchema }: SchemaIncompatibleProps) {
	// eslint-disable-next-line unicorn/prefer-ternary
	if (error.canUpgrade) {
		return (
			<div>
				<div>
					Document is incompatible with current version of the application, but the
					document format can be updated. This may prevent other versions of the
					application from opening this document.
				</div>
				<button onClick={(): void => upgradeSchema()}>Upgrade</button>;
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
