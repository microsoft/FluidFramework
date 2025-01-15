/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PureDataObject, PureDataObjectFactory } from "@fluidframework/aqueduct/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import type { IFluidDataStoreFactory } from "@fluidframework/runtime-definitions/internal";
import { createDataObjectKind } from "@fluidframework/shared-object-base/internal";
import type {
	ISharedObject,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	ITree,
	SchemaCompatibilityStatus,
	TreeViewConfiguration,
	TreeFieldFromImplicitField,
	TreeView,
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
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
 * Defines a DataObject for a {@link @fluidframework/tree#SharedTree} with a built in {@link @fluidframework/tree#TreeViewConfiguration}.
 * @param key - See {@link ITreeDataObject.key}.
 * @param treeConfiguration - See {@link ITreeDataObject.config}.
 * @param createInitialTree - Function which populates the tree with initial data on document create.
 * @returns A {@link @fluidframework/fluid-static#DataObjectClass} to allow easy use of a SharedTree in a ContainerSchema.
 * @public
 */
export function treeDataObject<TSchema extends ImplicitFieldSchema>(
	key: string,
	treeConfiguration: TreeViewConfiguration<TSchema>,
	createInitialTree: () => InsertableTreeFieldFromImplicitField<TSchema>,
): SharedObjectKind<IReactTreeDataObject<TSchema> & IFluidLoadable> {
	return treeDataObjectInternal(key, treeConfiguration, createInitialTree);
}

/**
 * Defines a DataObject for a {@link @fluidframework/tree#SharedTree} with a built in {@link @fluidframework/tree#TreeViewConfiguration}.
 * @param key - See {@link ITreeDataObject.key}.
 * @param treeConfiguration - See {@link ITreeDataObject.config}.
 * @param createInitialTree - Function which populates the tree with initial data on document create.
 * @returns A {@link @fluidframework/fluid-static#DataObjectClass} to allow easy use of a SharedTree in a ContainerSchema.
 * @internal
 */
export function treeDataObjectInternal<TSchema extends ImplicitFieldSchema>(
	key: string,
	treeConfiguration: TreeViewConfiguration<TSchema>,
	createInitialTree: () => InsertableTreeFieldFromImplicitField<TSchema>,
): SharedObjectKind<IReactTreeDataObject<TSchema> & IFluidLoadable> & {
	readonly factory: IFluidDataStoreFactory;
} {
	class SchemaAwareTreeDataObject extends TreeDataObject<TSchema> {
		public readonly key = key;
		public readonly config = treeConfiguration;
		protected readonly createInitialTree = createInitialTree;

		public static readonly factory = new PureDataObjectFactory(
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
	 * TreeViewConfiguration used to initialize new documents, as well as to interpret (schematize) existing ones.
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
	readonly config: TreeViewConfiguration<TSchema>;

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
	 * This includes displaying errors when the document can not be viewed using the view schema.
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
	 * when tree content is not compatible with the {@link @fluidframework/tree#TreeViewConfiguration}.
	 *
	 * @defaultValue Component which describes the situation (in English) and allows the user to upgrade the schema to match the {@link @fluidframework/tree#TreeViewConfiguration} if possible.
	 */
	readonly errorComponent?: React.FC<SchemaIncompatibleProps>;
}

/**
 * Generic DataObject for shared trees.
 * @internal
 */
export abstract class TreeDataObject<TSchema extends ImplicitFieldSchema = ImplicitFieldSchema>
	extends PureDataObject
	implements IReactTreeDataObject<TSchema>
{
	private internalRoot: ITree | undefined;
	private readonly rootTreeId = "root";

	/**
	 * The root tree will either be ready or will return an error. If an error is thrown
	 * the root has not been correctly created/set.
	 */
	protected get root(): ITree {
		if (!this.internalRoot) {
			throw new Error(this.getUninitializedErrorString(`root`));
		}

		return this.internalRoot;
	}

	/**
	 * Initializes internal objects and calls initialization overrides.
	 * Caller is responsible for ensuring this is only invoked once.
	 */
	public async initializeInternal(existing: boolean): Promise<void> {
		if (existing) {
			// data store has a root tree so we just need to set it before calling initializingFromExisting
			const channel = await this.runtime.getChannel(this.rootTreeId);
			if (SharedTree.is(channel)) {
				this.internalRoot = channel;
			} else {
				throw new UsageError(
					`Content with id ${channel.id} is not a SharedTree and cannot be loaded with treeDataObject.`,
				);
			}
		} else {
			this.internalRoot = SharedTree.create(this.runtime, this.rootTreeId);
			(this.internalRoot as unknown as ISharedObject).bindToContext();
		}

		await super.initializeInternal(existing);
	}

	/**
	 * Generates an error string indicating an item is uninitialized.
	 * @param item - The name of the item that was uninitialized.
	 */
	protected getUninitializedErrorString(item: string): string {
		return `${item} must be initialized before being accessed.`;
	}

	#tree?: TreeView<TSchema>;

	public get tree(): TreeView<TSchema> {
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
		return this.#tree;
	}

	protected override async initializingFirstTime(): Promise<void> {
		const tree = SharedTree.create(this.runtime);
		this.#tree = tree.viewWith(this.config);
		// Initialize the tree content and schema.
		this.#tree.initialize(this.createInitialTree());
	}

	protected override async initializingFromExisting(): Promise<void> {
		this.#tree = this.root.viewWith(this.config);
	}

	protected override async hasInitialized(): Promise<void> {
		if (this.#tree === undefined) throw new Error(this.getUninitializedErrorString("tree"));
	}

	public abstract readonly key: string;

	public abstract readonly config: TreeViewConfiguration<TSchema>;

	protected abstract createInitialTree(): InsertableTreeFieldFromImplicitField<TSchema>;

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

function useViewCompatibility<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): SchemaCompatibilityStatus {
	const [compatibility, setCompatibility] = React.useState<SchemaCompatibilityStatus>(
		view.compatibility,
	);

	React.useEffect(() => {
		const updateCompatibility = (): void => {
			setCompatibility(view.compatibility);
		};

		updateCompatibility();
		return view.events.on("schemaChanged", updateCompatibility);
	}, [view]);

	return compatibility;
}

function useViewRoot<TSchema extends ImplicitFieldSchema>(
	view: TreeView<TSchema>,
): TreeFieldFromImplicitField<TSchema> | undefined {
	const [root, setRoot] = React.useState<TreeFieldFromImplicitField<TSchema> | undefined>(
		undefined,
	);

	React.useEffect(() => {
		const updateRoot = (): void => {
			if (view.compatibility.canView) {
				setRoot(view.root);
			} else {
				setRoot(undefined);
			}
		};

		updateRoot();
		return view.events.on("rootChanged", updateRoot);
	}, [view]);

	return root;
}

/**
 * React component which handles schematizing trees.
 * This includes displaying errors when the document can not be schematized.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function TreeViewComponent<TSchema extends ImplicitFieldSchema>({
	tree,
	viewComponent: ViewComponent,
	errorComponent,
}: TreeViewProps<TSchema> & {
	tree: TreeDataObject<TSchema>;
}) {
	const view = tree.tree;

	const compatibility = useViewCompatibility(view);
	const root = useViewRoot(view);
	const upgradeSchema = React.useCallback((): void => view.upgradeSchema(), [view]);

	// Note: this policy is on the stricter side and ensures that clients will only be able to submit edits when their view schema
	// supports exactly the same documents as the stored schema.
	// A realistic production application using this strategy would need to take steps to attempt to open the document using
	// several different view schemas in order to ensure that their users don't temporarily lose access to documents while
	// code rollout is in progress.
	// Alternative policies can be implemented, see "Schema Evolvability" in SharedTree's README for more information.
	if (!compatibility.isEquivalent) {
		const Error = errorComponent ?? TreeErrorComponent;
		return <Error compatibility={compatibility} upgradeSchema={upgradeSchema} />;
	}

	if (root === undefined) {
		return <div>View not set</div>;
	}

	return <ViewComponent root={root} />;
}

/**
 * React Props for displaying when the opened document is incompatible with the required view schema.
 * @public
 */
export interface SchemaIncompatibleProps {
	/**
	 * Information about the view schema's compatibility with the stored schema.
	 */
	readonly compatibility: SchemaCompatibilityStatus;
	/**
	 * Callback to request that the stored schema in the document be upgraded.
	 */
	readonly upgradeSchema: () => void;
}

/**
 * React component which displays schema errors and allows upgrading schema when possible.
 */
function TreeErrorComponent({
	compatibility,
	upgradeSchema,
}: {
	compatibility: SchemaCompatibilityStatus;
	upgradeSchema: () => void;
}): React.JSX.Element {
	// eslint-disable-next-line unicorn/prefer-ternary
	if (compatibility.canUpgrade) {
		return (
			<div>
				<div>
					Document is incompatible with current version of the application, but the document
					format can be updated. This may prevent other versions of the application from
					opening this document.
				</div>
				<button onClick={upgradeSchema}>Upgrade</button>;
			</div>
		);
	} else {
		return (
			<div>
				Document is incompatible with current version of the application, and the document
				format cannot be updated. The document is likely from a newer or otherwise incompatible
				version of the application, or a different application.
			</div>
		);
	}
}
