/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	Anchor,
	FieldKey,
	TreeNavigationResult,
	ITreeSubscriptionCursor,
	FieldStoredSchema,
	LocalFieldKey,
	TreeStoredSchema,
	ValueSchema,
	lookupTreeSchema,
	mapCursorField,
	CursorLocationType,
	FieldAnchor,
	ITreeCursor,
	inCursorNode,
	FieldUpPath,
} from "../../core";
import { Multiplicity } from "../modular-schema";
import {
	getFieldKind,
	getPrimaryField,
	isPrimitiveValue,
	ContextuallyTypedNodeData,
	arrayLikeMarkerSymbol,
	cursorFromContextualData,
} from "../contextuallyTyped";
import { sequence } from "../defaultFieldKinds";
import { assertValidIndex } from "../../util";
import { AdaptingProxyHandler, adaptWithProxy, isPrimitive, keyIsValidIndex } from "./utilities";
import { ProxyContext } from "./editableTreeContext";
import {
	EditableField,
	EditableTree,
	UnwrappedEditableField,
	UnwrappedEditableTree,
	proxyTargetSymbol,
} from "./editableTreeTypes";
import { makeTree } from "./editableTree";
import { ProxyTarget } from "./ProxyTarget";

export function makeField(
	context: ProxyContext,
	fieldSchema: FieldStoredSchema,
	cursor: ITreeSubscriptionCursor,
): EditableField {
	const targetSequence = new FieldProxyTarget(context, fieldSchema, cursor);
	return adaptWithProxy(targetSequence, fieldProxyHandler);
}

export function isFieldProxyTarget(
	target: ProxyTarget<Anchor | FieldAnchor>,
): target is FieldProxyTarget {
	return target instanceof FieldProxyTarget;
}

/**
 * @returns the key, if any, of the primary array field.
 */
function getPrimaryArrayKey(
	type: TreeStoredSchema,
): { key: LocalFieldKey; schema: FieldStoredSchema } | undefined {
	const primary = getPrimaryField(type);
	if (primary === undefined) {
		return undefined;
	}
	const kind = getFieldKind(primary.schema);
	if (kind.multiplicity === Multiplicity.Sequence) {
		// TODO: this could have issues if there are non-primary keys
		// that can collide with the array APIs (length or integers).
		return primary;
	}
	return undefined;
}

/**
 * A Proxy target, which together with a `fieldProxyHandler` implements a basic access to
 * the nodes of {@link EditableField} by means of the cursors.
 */
export class FieldProxyTarget extends ProxyTarget<FieldAnchor> implements EditableField {
	public readonly fieldKey: FieldKey;
	public readonly [arrayLikeMarkerSymbol]: true;

	// Used to override the default value of [Symbol.isConcatSpreadable].
	private isSpreadable?: boolean;

	public constructor(
		context: ProxyContext,
		public readonly fieldSchema: FieldStoredSchema,
		cursor: ITreeSubscriptionCursor,
	) {
		super(context, cursor);
		assert(cursor.mode === CursorLocationType.Fields, 0x453 /* must be in fields mode */);
		this.fieldKey = cursor.getFieldKey();
		this[arrayLikeMarkerSymbol] = true;
	}

	public get [proxyTargetSymbol](): FieldProxyTarget {
		return this;
	}

	public get parent(): EditableTree | undefined {
		if (this.getAnchor().parent === undefined) {
			return undefined;
		}

		const cursor = this.cursor;
		cursor.exitField();
		const output = makeTree(this.context, cursor);
		cursor.enterField(this.fieldKey);
		return output;
	}

	protected buildAnchor(): FieldAnchor {
		return this.cursor.buildFieldAnchor();
	}

	protected tryMoveCursorToAnchor(
		anchor: FieldAnchor,
		cursor: ITreeSubscriptionCursor,
	): TreeNavigationResult {
		return this.context.forest.tryMoveCursorToField(anchor, cursor);
	}

	protected forgetAnchor(anchor: FieldAnchor): void {
		if (anchor.parent === undefined) return;
		this.context.forest.anchors.forget(anchor.parent);
	}

	[index: number]: UnwrappedEditableTree;

	// This field controls if an array is inlined during concatenation.
	public get [Symbol.isConcatSpreadable]() {
		return this.isSpreadable ?? true;
	}

	public set [Symbol.isConcatSpreadable](value: boolean) {
		this.isSpreadable = value;
	}

	public get length(): number {
		return this.cursor.getFieldLength();
	}

	public set length(value: number) {
		const count = this.length - value;

		if (count > 0) {
			this.deleteNodes(value, count);
		} else if (count === 0) {
		} else if (count < 0) {
			throw new Error("Not supported. Use `insertNodes()` instead");
		} else {
			throw new RangeError("Invalid array length");
		}
	}

	/**
	 * Returns a node (unwrapped by default, see {@link UnwrappedEditableTree}) by its index.
	 */
	public unwrappedTree(index: number): UnwrappedEditableTree {
		return inCursorNode(this.cursor, index, (cursor) => unwrappedTree(this.context, cursor));
	}

	/**
	 * Gets a node by its index without unwrapping.
	 */
	public getNode(index: number): EditableTree {
		assert(
			keyIsValidIndex(index, this.length),
			0x454 /* A child node must exist at index to get it without unwrapping. */,
		);
		return inCursorNode(this.cursor, index, (cursor) => makeTree(this.context, cursor));
	}

	/**
	 * Gets array of unwrapped nodes.
	 */
	private asArray(): UnwrappedEditableTree[] {
		return mapCursorField(this.cursor, (cursor) => unwrappedTree(this.context, cursor));
	}

	public get [Symbol.iterator](): () => IterableIterator<UnwrappedEditableTree> {
		return () => this.asArray().values();
	}

	public insertNodes(index: number, newContent: ITreeCursor | ITreeCursor[]): void {
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length === 0 && (!Array.isArray(newContent) || newContent.length <= 1),
				0x455 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			keyIsValidIndex(index, this.length + 1),
			0x456 /* Index must be less than or equal to length. */,
		);
		const fieldPath = this.cursor.getFieldPath();
		this.context.insertNodes(fieldPath, index, newContent);
	}

	public moveNodes(
		sourceIndex: number,
		count: number,
		destinationIndex: number,
		destinationField?: EditableField,
	): void {
		const sourceFieldPath = this.cursor.getFieldPath();
		const destinationFieldKindIdentifier =
			destinationField !== undefined
				? destinationField.fieldSchema.kind.identifier
				: this.fieldSchema.kind.identifier;

		assert(
			this.fieldSchema.kind.identifier === sequence.identifier &&
				destinationFieldKindIdentifier === sequence.identifier,
			0x683 /* Both source and destination fields must be sequence fields. */,
		);

		const destinationFieldProxy =
			destinationField !== undefined
				? (destinationField[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
				: this;
		assert(
			isFieldProxyTarget(destinationFieldProxy),
			0x684 /* destination field proxy must be a field proxy target */,
		);
		assertValidIndex(destinationIndex, destinationFieldProxy, true);

		const destinationFieldPath = destinationFieldProxy.cursor.getFieldPath();

		this.context.moveNodes(
			sourceFieldPath,
			sourceIndex,
			count,
			destinationFieldPath,
			destinationIndex,
		);
	}

	public getfieldPath(): FieldUpPath {
		return this.cursor.getFieldPath();
	}

	public deleteNodes(index: number, count?: number): void {
		// TODO: currently for all field kinds the nodes can be deleted by editor using `sequenceField.delete()`.
		// Uncomment when the editor will become more schema-aware.
		// const fieldKind = getFieldKind(this.fieldSchema);
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		assert(
			this.length === 0 || keyIsValidIndex(index, this.length),
			0x457 /* Index must be less than length. */,
		);
		if (count !== undefined) assert(count >= 0, 0x458 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const _count = count === undefined || count > maxCount ? maxCount : count;
		const fieldPath = this.cursor.getFieldPath();
		this.context.deleteNodes(fieldPath, index, _count);
	}

	public replaceNodes(
		index: number,
		newContent: ITreeCursor | ITreeCursor[],
		count?: number,
	): void {
		const fieldKind = getFieldKind(this.fieldSchema);
		// TODO: currently for all field kinds the nodes can be created by editor using `sequenceField.insert()`.
		// Uncomment the next line and remove non-sequence related code when the editor will become more schema-aware.
		// assert(fieldKind.multiplicity === Multiplicity.Sequence, "The field must be of a sequence kind.");
		if (fieldKind.multiplicity !== Multiplicity.Sequence) {
			assert(
				this.length <= 1 && (!Array.isArray(newContent) || newContent.length <= 1),
				0x4d0 /* A non-sequence field cannot have more than one node. */,
			);
		}
		assert(
			(this.length === 0 && index === 0) || keyIsValidIndex(index, this.length),
			0x4d1 /* Index must be less than length or, if the field is empty, be 0. */,
		);
		if (count !== undefined) assert(count >= 0, 0x4d2 /* Count must be non-negative. */);
		const maxCount = this.length - index;
		const _count = count === undefined || count > maxCount ? maxCount : count;
		const fieldPath = this.cursor.getFieldPath();
		this.context.replaceNodes(fieldPath, index, _count, newContent);
	}
}

const properties = [
	{
		key: arrayLikeMarkerSymbol,
		enumerable: false,
		value: true,
		writable: false,
	},
	{ key: proxyTargetSymbol, enumerable: false, writable: false },
	{ key: Symbol.iterator, enumerable: false, writable: false },
	{ key: Symbol.isConcatSpreadable, enumerable: false, writable: true },
	{ key: "length", enumerable: false, writable: true },
	{ key: "fieldKey", enumerable: false, writable: false },
	{ key: "fieldSchema", enumerable: false, writable: false },
	{ key: "parent", enumerable: false, writable: false },
	{ key: "context", enumerable: false, writable: false },
];

function createPropMap(props: typeof properties) {
	const map: PropertyDescriptorMap = {};

	for (const { key, enumerable, value, writable } of props) {
		const desc: PropertyDescriptor = (map[key as string] = {
			enumerable,
			configurable: true,
		});

		if (value !== undefined) {
			assert(!writable, "'value' must be constant.");
			desc.value = value;
			desc.writable = false;
		} else {
			desc.get = function (this: Record<string | symbol, any>) {
				return this[key] as unknown;
			};

			if (writable) {
				desc.set = function (
					this: { [proxyTargetSymbol]: FieldProxyTarget },
					newValue: unknown,
				) {
					return Reflect.set(this[proxyTargetSymbol], key, newValue) as unknown;
				};
			}
		}
	}

	return map;
}

export const ownPropertyMap = createPropMap(properties);
export const ownPropertyKeys = Object.keys(ownPropertyMap);

/* eslint-disable @typescript-eslint/unbound-method -- Intentionally forwarding proxy instance to unbound Array methods */

const arrayFns = [
	Array.prototype.forEach,
	Array.prototype.concat,
	Array.prototype.every,
	Array.prototype.filter,
	Array.prototype.find,
	Array.prototype.findIndex,
	// Array.prototype.findLast,   				// TODO: Requires newer ES lib
	// Array.prototype.findLastIndex,			// TODO: Requires newer ES lib
	// Array.prototype.flat, 					// TODO: Requires newer ES lib
	// Array.prototype.flatMap, 				// TODO: Requires newer ES lib
	Array.prototype.includes,
	Array.prototype.indexOf,
	Array.prototype.join,
	Array.prototype.keys,
	Array.prototype.lastIndexOf,
	Array.prototype.map,
	Array.prototype.push,
	Array.prototype.slice,
	Array.prototype.reduce,
	Array.prototype.reduceRight,
	Array.prototype.some,
	// Array.prototype.splice,					// TODO: Needs custom implementation (increases length to resize)
	Array.prototype.toLocaleString,
	Array.prototype.toString,
	// Array.prototype.toReversed,				// TODO: Requires newer ES lib
	// Array.prototype.toSorted,				// TODO: Requires newer ES lib
	// Array.prototype.toSpliced,				// TODO: Requires newer ES lib
	// Array.prototype.unshift,					// TODO: Needs custom implementation (sets indices > length)
	Array.prototype.values,
	// Array.prototype.with,					// TODO: Requires newer ES lib
	// Array.prototype[Symbol.iterator],		// (Use implementation from FieldProxyTarget)
	// Array.prototype[Symbol.unscopables],		// TODO: Requires newer ES lib (used by 'with()')
];

const targetFns = [
	FieldProxyTarget.prototype.deleteNodes,
	FieldProxyTarget.prototype.getNode,
	FieldProxyTarget.prototype.insertNodes,
	FieldProxyTarget.prototype.moveNodes,
	FieldProxyTarget.prototype.replaceNodes,
];

/* eslint-enable @typescript-eslint/unbound-method -- Intentionally forwarding proxy instance to unbound Array methods */

function createFnMap(
	owner: any,
	fns: ((...args2: any[]) => unknown)[],
	dispatch?: (...args1: any[]) => (...args2: any[]) => unknown,
) {
	const map: PropertyDescriptorMap = {};
	const ownerDescs = Object.getOwnPropertyDescriptors(owner);

	for (const fn of fns) {
		const name = fn.name;
		const desc = (map[name] = ownerDescs[name]);

		assert(desc !== undefined, "'fn' must be own member of 'owner'");

		if (dispatch !== undefined) {
			desc.value = dispatch(desc.value);
		}
	}

	return map;
}

export const fullPropertyMap = Object.assign(
	createFnMap(Array.prototype, arrayFns),
	createFnMap(
		FieldProxyTarget.prototype,
		targetFns,
		/* dispatch: */ (targetFn: (...args: any) => unknown) =>
			function (this: { [proxyTargetSymbol]: FieldProxyTarget }, ...args: any[]) {
				// The 'this' argument is our Proxy.
				// Use '[proxyTargetSymbol]' to get a reference to the underlying FieldProxyTarget.
				return Reflect.apply(targetFn, this[proxyTargetSymbol], args) as unknown;
			},
	),
	ownPropertyMap,
);

/**
 * Returns a Proxy handler, which together with a {@link FieldProxyTarget} implements a basic read/write access to
 * the sequence fields by means of the cursors.
 */
const fieldProxyHandler: AdaptingProxyHandler<FieldProxyTarget, EditableField> = {
	get: (target: FieldProxyTarget, key: string | symbol, receiver: object): unknown => {
		if (key === proxyTargetSymbol) {
			return target;
		}

		const desc = fullPropertyMap[key as string];
		if (desc !== undefined) {
			// eslint-disable-next-line @typescript-eslint/unbound-method
			return desc.get !== undefined ? Reflect.apply(desc.get, target, []) : desc.value;
		}

		if (typeof key === "string") {
			if (keyIsValidIndex(key, target.length)) {
				return target.unwrappedTree(Number(key));
			}
		}

		return undefined;
	},
	set: (
		target: FieldProxyTarget,
		key: string,
		value: ContextuallyTypedNodeData,
		receiver: unknown,
	): boolean => {
		const desc = fullPropertyMap[key];
		if (desc?.set) {
			// eslint-disable-next-line @typescript-eslint/unbound-method
			Reflect.apply(desc.set, target, [value]);
			return true;
		}

		const cursor = cursorFromContextualData(
			target.context.schema,
			target.fieldSchema.types,
			value,
		);
		// This is just a cheap way to check if there might be a node at the given index.
		// An implementation of the target methods holds all relevant key assertions.
		// TODO: maybe refactor this to add a real node existence check if desired,
		// but it might be costly regarding performance.
		if (keyIsValidIndex(key, target.length)) {
			target.replaceNodes(Number(key), cursor, 1);
		} else {
			target.insertNodes(Number(key), cursor);
		}
		return true;
	},
	deleteProperty: (target: FieldProxyTarget, key: string): boolean => {
		throw new Error("Not supported. Use `deleteNodes()` instead");
	},
	// Include documented symbols and all non-empty fields.
	has: (target: FieldProxyTarget, key: string | symbol): boolean => {
		if (key === Symbol.isConcatSpreadable) {
			return false;
		}

		return (
			Reflect.has(fullPropertyMap, key) ||
			(typeof key === "string" && keyIsValidIndex(key, target.length))
		);
	},
	ownKeys: (target: FieldProxyTarget): ArrayLike<keyof EditableField> => {
		const keys: string[] = Array.from({ length: target.length }, (_, index) => `${index}`);
		keys.push(...ownPropertyKeys);
		return keys as ArrayLike<keyof EditableField>;
	},
	getOwnPropertyDescriptor: (
		target: FieldProxyTarget,
		key: string | symbol,
	): PropertyDescriptor | undefined => {
		const maybeDesc = ownPropertyMap[key as string];
		if (maybeDesc !== undefined) {
			return maybeDesc;
		} else if (typeof key === "string" && keyIsValidIndex(key, target.length)) {
			return {
				configurable: true,
				enumerable: true,
				value: target.unwrappedTree(Number(key)),
				writable: true,
			};
		}
		return undefined;
	},
};

/**
 * See {@link UnwrappedEditableTree} for documentation on what unwrapping this performs.
 */
function unwrappedTree(
	context: ProxyContext,
	cursor: ITreeSubscriptionCursor,
): UnwrappedEditableTree {
	const nodeTypeName = cursor.type;
	const nodeType = lookupTreeSchema(context.schema, nodeTypeName);
	// Unwrap primitives or nodes having a primary field. Sequences unwrap nodes on their own.
	if (isPrimitive(nodeType)) {
		const nodeValue = cursor.value;
		if (isPrimitiveValue(nodeValue)) {
			return nodeValue;
		}
		assert(
			nodeType.value === ValueSchema.Serializable,
			0x3c7 /* `undefined` values not allowed for primitive fields */,
		);
	}

	const primary = getPrimaryArrayKey(nodeType);
	if (primary !== undefined) {
		cursor.enterField(primary.key);
		const primaryField = makeField(context, primary.schema, cursor);
		cursor.exitField();
		return primaryField;
	}
	return makeTree(context, cursor);
}

/**
 * @param context - the common context of the field.
 * @param fieldSchema - the FieldStoredSchema of the field.
 * @param cursor - the cursor, which must point to the field being proxified.
 */
export function unwrappedField(
	context: ProxyContext,
	fieldSchema: FieldStoredSchema,
	cursor: ITreeSubscriptionCursor,
): UnwrappedEditableField {
	const fieldKind = getFieldKind(fieldSchema);
	if (fieldKind.multiplicity === Multiplicity.Sequence) {
		return makeField(context, fieldSchema, cursor);
	}
	const length = cursor.getFieldLength();
	assert(length <= 1, 0x3c8 /* invalid non sequence */);
	if (length === 1) {
		return inCursorNode(cursor, 0, (innerCursor) => unwrappedTree(context, innerCursor));
	}
	assert(
		fieldKind.multiplicity === Multiplicity.Optional ||
			fieldKind.multiplicity === Multiplicity.Forbidden,
		0x59a /* invalid empty field */,
	);
	return undefined;
}

/**
 * Checks the type of an UnwrappedEditableField.
 * @alpha
 */
export function isEditableField(field: UnwrappedEditableField): field is EditableField {
	return (
		typeof field === "object" &&
		isFieldProxyTarget(field[proxyTargetSymbol] as ProxyTarget<Anchor | FieldAnchor>)
	);
}
