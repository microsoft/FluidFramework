/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable unicorn/prefer-string-slice */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable import/no-default-export */
/* eslint-disable import/no-internal-modules */
/* eslint-disable import/no-unassigned-import */
/* eslint-disable @typescript-eslint/no-floating-promises */

import {
	brand,
	SchemaData,
	emptyField,
	ValueSchema,
	EditableTree,
	Brand,
	Delta,
	fieldSchema,
	JsonableTree,
	FieldKey,
	Value,
	LocalFieldKey,
	rootFieldKey,
	rootFieldKeySymbol,
	ContextuallyTypedNodeData,
	FieldKinds,
	FieldSchema,
	FieldKindIdentifier,
	namedTreeSchema,
	singleTextCursor,
	typeNameSymbol,
	valueSymbol,
	TreeSchemaIdentifier,
	TreeSchema,
	TreeTypeSet,
	NamedTreeSchema,
	jsonableTreeFromCursor,
	BrandedType,
	ModularChangeset,
	on,
	getField,
	ISharedTree,
} from "@fluid-internal/tree";
import {
	DeltaVisitor,
	visitDelta,
	isLocalKey,
	ITreeCursorSynchronous,
	isGlobalFieldKey,
	ChangeFamilyEditor,
	FieldKindSpecifier,
} from "@fluid-internal/tree/dist/core";
import {
	DefaultChangeFamily,
	EditableField,
	EditManagerIndex,
	ForestIndex,
	SchemaIndex,
} from "@fluid-internal/tree/dist/feature-libraries";
import { SharedTreeCore } from "@fluid-internal/tree/dist/shared-tree-core";

// ======= API Start ==========

/**
 * Question: Where should this API reside ?
 */

/**
 * General interface to access nodes in the tree,
 * see {@link RootResolver}, {@link PathBasedResolver}, {@link CustomResolver}, etc.
 */
export interface NodeResolver {
	resolve(): Iterable<EditableTree>;
}

/**
 * Categories of changes, such node local, subtree
 */
export enum ChangeCategory {
	LOCAL,
	SUBTREE,
}

/**
 * Binding for changes, local or subtree, see {@link BatchedChangesBinder}
 */
export interface ChangeBinder {
	bindOnChange(category: ChangeCategory, fn: () => void): () => void;
}

/**
 * Binding for consistency boundaries, ie transaction completion
 */
export interface BatchBinder {
	bindOnBatch(fn: () => void): () => void;
}

// ======= API End ==========

/**
 * 1st example of NodeResolver impl.
 */

class RootResolver implements NodeResolver {
	constructor(public readonly root: EditableField) {}

	resolve(): Iterable<EditableTree> {
		const currentField = this.root;
		return [currentField.getNode(0)];
	}
}

/**
 * 2nd example of NodeResolver impl.
 */

interface Step {
	readonly index: number;
	readonly field: FieldKey;
}

class PathBasedResolver implements NodeResolver {
	constructor(
		public readonly root: EditableField,
		public readonly index: number,
		public readonly path: Step[],
	) {}

	resolve(): Iterable<EditableTree> {
		let currentField = this.root;
		let parentIndex = this.index;
		for (const step of this.path) {
			currentField = currentField.getNode(parentIndex)[getField](step.field);
			parentIndex = step.index;
		}
		return [currentField.getNode(parentIndex)];
	}
}

/**
 * 3rd example of NodeResolver impl.
 */

const drawKeys: LocalFieldKey = brand("drawKeys");

class CustomResolver implements NodeResolver {
	constructor(public readonly root: EditableField) {}
	resolve(): Iterable<EditableTree> {
		const lastCell = this.root.getNode(0)[getField](drawKeys).getNode(2);
		return [lastCell];
	}
}

/**
 * Example binder, eg. impl. both {@link ChangeBinder} , {@link BatchBinder} interfaces
 */

class BatchedChangesBinder implements ChangeBinder, BatchBinder {
	constructor(public readonly sharedTree: ISharedTree, public readonly resolver: NodeResolver) {}
	bindOnBatch(fn: () => void): () => void {
		const handle = this.sharedTree.events.on("afterBatch", () => fn());
		return () => handle();
	}
	bindOnChange(category: ChangeCategory, fn: () => void): () => void {
		const handles: (() => void)[] = [];
		const nodes = this.resolver.resolve();
		let eventName;
		switch (category) {
			case ChangeCategory.LOCAL:
				eventName = "changing";
				break;
			case ChangeCategory.SUBTREE:
				eventName = "subtreeChanging";
				break;
			default:
				throw new Error("unknown change category");
		}
		for (const node of nodes) {
			handles.push(node[on](eventName, () => fn()));
		}
		return () => {
			for (const handle of handles) {
				handle();
			}
		};
	}
}

/**
 * Expression parser (dummy)
 *
 * @param expression - text expected in the following format `field[index].field[index].field[index]`
 * @returns syntax validated Step[]
 */
function parseSteps(expression: string): Step[] {
	const steps: Step[] = [];
	const regex = /(\w+)\[(\d+)]/g;
	let match;
	while ((match = regex.exec(expression)) !== null) {
		const field = match[1] as string;
		const branded: LocalFieldKey = brand(field);
		const index = Number(match[2]);
		steps.push({ field: branded, index });
	}
	return steps;
}

/**
 * Semantic validation (dummy)
 * @param steps - a schema path
 * @param schema - a schema
 * @returns semantically validated Step[]
 */
function validate(steps: Step[], schema: SchemaData): Step[] {
	const rootSchemaIdentifiers = schema.globalFieldSchema.get(rootFieldKey)?.types;
	let nextSchemaIdentifiers = rootSchemaIdentifiers;
	const out: Step[] = [];
	label: for (const step of steps) {
		let found = false;
		if (nextSchemaIdentifiers !== undefined) {
			const nextSchemaIdentifiersExist =
				nextSchemaIdentifiers as ReadonlySet<TreeSchemaIdentifier>;
			for (const nextSchemaIdentifier of nextSchemaIdentifiersExist) {
				const treeSchema: TreeSchema | undefined =
					schema.treeSchema.get(nextSchemaIdentifier);
				if (treeSchema !== undefined && isLocalKey(step.field)) {
					const localFieldSchema: FieldSchema | undefined = treeSchema.localFields.get(
						step.field,
					);
					if (localFieldSchema !== undefined) {
						out.push(step);
						nextSchemaIdentifiers = localFieldSchema?.types;
						found = true;
						continue label;
					}
				}
			}
		}
		if (!found) throw new Error(`Path error, field ${step.field.toString()} not found`);
	}
	return out;
}

/**
 * 1st binder factory, root binder
 * @param tree - shared tree
 * @returns binder instance
 */
export function createRootBinder(tree: ISharedTree): BatchedChangesBinder {
	const root = tree.context.root;
	const resolver = new RootResolver(root);
	return new BatchedChangesBinder(tree, resolver);
}

/**
 * 2nd binder factory, path based binder
 * @param tree - shared tree
 * @returns binder instance
 */
export function createPathBinder(
	tree: ISharedTree,
	schema: SchemaData,
	expression: string,
): BatchedChangesBinder {
	const path: Step[] = parseSteps(expression);
	const valid: Step[] = validate(path, schema);
	const root = tree.context.root;
	const resolver = new PathBasedResolver(root, 0, valid);
	return new BatchedChangesBinder(tree, resolver);
}

/**
 * 3rd binder factory, custom binder
 * @param tree - shared tree
 * @returns binder instance
 */
export function createCustomBinder(tree: ISharedTree): BatchedChangesBinder {
	const root = tree.context.root;
	const resolver = new CustomResolver(root);
	return new BatchedChangesBinder(tree, resolver);
}
