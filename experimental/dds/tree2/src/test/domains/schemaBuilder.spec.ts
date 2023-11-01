/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder, leaf } from "../../domains";
import {
	Any,
	FieldKinds,
	TreeFieldSchema,
	Sequence,
	TreeNodeSchema,
	schemaIsFieldNode,
	schemaIsMap,
	ProxyNode,
	ObjectNodeSchema,
	SharedTreeObject,
} from "../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { TypedNode, UnboxNode } from "../../feature-libraries/editable-tree-2/editableTreeTypes";
import { areSafelyAssignable, isAny, requireFalse, requireTrue } from "../../util";
// eslint-disable-next-line import/no-internal-modules
import { structuralName } from "../../domains/schemaBuilder";
// eslint-disable-next-line import/no-internal-modules
import { extractFactoryContent } from "../../feature-libraries/editable-tree-2/proxies/objectFactory";

describe("domains - SchemaBuilder", () => {
	describe("list", () => {
		describe("structural", () => {
			it("Any", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const listAny = builder.list(Any);
				assert(schemaIsFieldNode(listAny));
				assert.equal(listAny.name, "scope.List<Any>");
				assert(
					listAny.objectNodeFields
						.get("")
						.equals(TreeFieldSchema.create(FieldKinds.sequence, [Any])),
				);
				type ListAny = UnboxNode<typeof listAny>;
				type _check = requireTrue<areSafelyAssignable<ListAny, Sequence<readonly [Any]>>>;

				assert.equal(builder.list(Any), listAny);
			});

			it("implicit", () => {
				const builder = new SchemaBuilder({ scope: "scope2" });

				const listImplicit = builder.list(builder.number);
				assert(schemaIsFieldNode(listImplicit));
				assert.equal(listImplicit.name, `scope2.List<["${builder.number.name}"]>`);
				assert(
					listImplicit.objectNodeFields
						.get("")
						.equals(TreeFieldSchema.create(FieldKinds.sequence, [builder.number])),
				);
				type ListAny = UnboxNode<typeof listImplicit>;
				type _check = requireTrue<
					areSafelyAssignable<ListAny, Sequence<readonly [typeof builder.number]>>
				>;

				assert.equal(builder.list(builder.number), listImplicit);
			});

			it("implicit normalizes", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const listImplicit = builder.list(builder.number);
				const listExplicit = builder.list([builder.number]);

				assert.equal(listImplicit, listExplicit);
			});

			it("union", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const listUnion = builder.list([builder.number, builder.boolean]);
				assert(schemaIsFieldNode(listUnion));

				assert.equal(
					listUnion.name,
					// Sorted alphabetically
					`scope.List<["${builder.boolean.name}","${builder.number.name}"]>`,
				);
				assert(
					listUnion.objectNodeFields
						.get("")
						.equals(
							TreeFieldSchema.create(FieldKinds.sequence, [
								builder.number,
								builder.boolean,
							]),
						),
				);
				type ListAny = UnboxNode<typeof listUnion>;
				type _check = requireTrue<
					areSafelyAssignable<
						ListAny,
						Sequence<readonly [typeof builder.number, typeof builder.boolean]>
					>
				>;
				// TODO: this should compile: ideally EditableTree's use of AllowedTypes would be compile time order independent like it is runtime order independent, but its currently not.
				type _check2 = requireTrue<
					// @ts-expect-error Currently not order independent: ideally this would compile
					areSafelyAssignable<
						ListAny,
						Sequence<readonly [typeof builder.boolean, typeof builder.number]>
					>
				>;

				assert.equal(builder.list([builder.number, builder.boolean]), listUnion);
				assert.equal(builder.list([builder.boolean, builder.number]), listUnion);
			});
		});

		describe("named list", () => {
			it("implicit normalizes", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const list = builder.list("Foo", builder.number);
				assert(schemaIsFieldNode(list));
				assert.equal(list.name, `scope.Foo`);
				assert(
					list.objectNodeFields
						.get("")
						.equals(TreeFieldSchema.create(FieldKinds.sequence, [builder.number])),
				);
				type ListAny = UnboxNode<typeof list>;
				type _check = requireTrue<
					areSafelyAssignable<ListAny, Sequence<readonly [typeof builder.number]>>
				>;

				// Not cached for structural use
				assert((builder.list(builder.number) as TreeNodeSchema) !== list);
				// Creating again errors instead or reuses
				assert.throws(() => builder.list("Foo", builder.number));
			});
		});
	});

	describe("map", () => {
		describe("structural", () => {
			it("implicit", () => {
				const builder = new SchemaBuilder({ scope: "scope" });
				const mapAny = builder.map(Any);
				assert(schemaIsMap(mapAny));
				// Correct name
				assert.equal(mapAny.name, "scope.Map<Any>");
				// Infers optional kind
				assert(mapAny.mapFields.equals(TreeFieldSchema.create(FieldKinds.optional, [Any])));
				// Cached and reused
				assert.equal(builder.map(Any), mapAny);
			});

			describe("named map", () => {
				it("implicit normalizes", () => {
					const builder = new SchemaBuilder({ scope: "scope" });

					const map = builder.map("Foo", builder.number);
					assert(schemaIsMap(map));
					assert.equal(map.name, `scope.Foo`);
					assert(
						map.mapFields.equals(
							TreeFieldSchema.create(FieldKinds.optional, [builder.number]),
						),
					);
				});

				it("explicit", () => {
					const builder = new SchemaBuilder({ scope: "scope" });

					const map = builder.map(
						"Foo",
						TreeFieldSchema.create(FieldKinds.sequence, [leaf.string]),
					);
					assert(schemaIsMap(map));
					assert.equal(map.name, `scope.Foo`);
					assert(
						map.mapFields.equals(
							TreeFieldSchema.create(FieldKinds.sequence, [leaf.string]),
						),
					);
				});
			});
		});
	});

	it("structuralName", () => {
		assert.equal(structuralName("X", Any), "X<Any>");
		assert.equal(structuralName("Y", []), "Y<[]>");
		// implicitly normalizes
		assert.equal(structuralName("List", leaf.number), structuralName("List", [leaf.number]));
		// Single item
		assert.equal(structuralName("List", leaf.number), `List<["${leaf.number.name}"]>`);
		// Sorted alphabetically
		assert.equal(
			structuralName("X", [leaf.number, leaf.boolean]),
			`X<["${leaf.boolean.name}","${leaf.number.name}"]>`,
		);
		// escaped names
		const builder = new SchemaBuilder({ scope: "scope" });
		const doubleName = builder.object(`bar","scope.foo`, {});
		assert.equal(structuralName("X", doubleName), `X<["scope.bar\\",\\"scope.foo"]>`);
		// This escaping ensures named don't collide:
		const foo = builder.object("foo", {});
		const bar = builder.object("bar", {});
		assert(structuralName("X", [bar, foo]) !== structuralName("X", doubleName));
	});

	it("object", () => {
		const builder = new SchemaBuilder({ scope: "Test Domain" });

		const testObject = builder.object("object", {
			number: builder.number,
		});

		type _0 = requireFalse<isAny<typeof testObject>>;
		type _1 = requireTrue<
			areSafelyAssignable<ProxyNode<typeof testObject>, { number: number }>
		>;

		function typeTests(x: ProxyNode<typeof testObject>) {
			const y: number = x.number;
		}
	});

	it("objectRecursive", () => {
		const builder = new SchemaBuilder({ scope: "Test Recursive Domain" });

		const recursiveObject = builder.objectRecursive("object", {
			recursive: TreeFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
			number: SchemaBuilder.required(builder.number),
		});

		type _0 = requireFalse<isAny<typeof recursiveObject>>;
		type Proxied = ProxyNode<typeof recursiveObject>;
		type _1 = requireFalse<isAny<Proxied>>;

		function typeTests(x: Proxied) {
			const y: number = x.number;
			const z: number | undefined = x.recursive?.recursive?.number;
		}

		function typeTests2(x: TypedNode<typeof recursiveObject>) {
			const y: number = x.number;
			const z: number | undefined = x.recursive?.recursive?.number;
		}

		const inner = recursiveObject.create({ recursive: undefined, number: 5 });
		const testOptional = recursiveObject.create({ number: 5 });

		const outer1 = recursiveObject.create({ recursive: inner, number: 1 });
		const outer2 = recursiveObject.create({ recursive: { number: 5 }, number: 1 });

		checkCreated(inner, { number: 5, recursive: undefined });
		checkCreated(testOptional, { number: 5 });
		checkCreated(outer1, { number: 1, recursive: { number: 5, recursive: undefined } });
		checkCreated(outer2, { number: 1, recursive: { number: 5 } });
	});

	it("fixRecursiveReference", () => {
		const builder = new SchemaBuilder({ scope: "Test Recursive Domain" });

		const recursiveReference = () => recursiveObject2;
		builder.fixRecursiveReference(recursiveReference);

		// Renaming this to recursiveObject causes IntelliSense to never work for this, instead of work after restarted until this code it touched.
		const recursiveObject2 = builder.object("object2", {
			recursive: builder.optional([recursiveReference]),
			number: leaf.number,
		});

		type _0 = requireFalse<isAny<typeof recursiveObject2>>;
		type _1 = requireTrue<
			areSafelyAssignable<
				typeof recursiveObject2,
				ReturnType<
					(typeof recursiveObject2.objectNodeFieldsObject.recursive.allowedTypes)[0]
				>
			>
		>;

		function typeTests(x: ProxyNode<typeof recursiveObject2>) {
			const y: number = x.number;
			const z: number | undefined = x.recursive?.recursive?.number;
		}

		function typeTests2(x: TypedNode<typeof recursiveObject2>) {
			const y: number = x.number;
			const z: number | undefined = x.recursive?.recursive?.number;
		}
	});
});

/**
 * These build objects are intentionally not holding the data their types make them appear to have as part of a workaround for https://github.com/microsoft/TypeScript/issues/43826.
 */
export function checkCreated<TSchema extends ObjectNodeSchema>(
	created: SharedTreeObject<TSchema>,
	expected: ProxyNode<TSchema>,
): void {
	assert.deepEqual(extractFactoryContent(created), expected);
}
