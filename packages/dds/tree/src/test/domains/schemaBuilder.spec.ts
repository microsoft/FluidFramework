/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder, leaf } from "../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { structuralName } from "../../domains/schemaBuilder.js";
import {
	Any,
	FieldKinds,
	FlexFieldSchema,
	FlexTreeNodeSchema,
	FlexTreeSequenceField,
	FlexTreeTypedNode,
	schemaIsFieldNode,
	schemaIsMap,
} from "../../feature-libraries/index.js";
import { areSafelyAssignable, isAny, requireFalse, requireTrue } from "../../util/index.js";

describe("domains - SchemaBuilder", () => {
	describe("list", () => {
		describe("structural", () => {
			it("Any", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const listAny = builder.list(Any);
				assert(schemaIsFieldNode(listAny));
				assert.equal(listAny.name, "scope.List<Any>");
				assert(listAny.info.equals(FlexFieldSchema.create(FieldKinds.sequence, [Any])));
				type ListAny = FlexTreeTypedNode<typeof listAny>["content"];
				type _check = requireTrue<
					areSafelyAssignable<ListAny, FlexTreeSequenceField<readonly [Any]>>
				>;

				assert.equal(builder.list(Any), listAny);
			});

			it("implicit", () => {
				const builder = new SchemaBuilder({ scope: "scope2" });

				const listImplicit = builder.list(builder.number);
				assert(schemaIsFieldNode(listImplicit));
				assert.equal(listImplicit.name, `scope2.List<["${builder.number.name}"]>`);
				assert(
					listImplicit.info.equals(
						FlexFieldSchema.create(FieldKinds.sequence, [builder.number]),
					),
				);
				type ListImplicit = FlexTreeTypedNode<typeof listImplicit>["content"];
				type _check = requireTrue<
					areSafelyAssignable<
						ListImplicit,
						FlexTreeSequenceField<readonly [typeof builder.number]>
					>
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
					listUnion.info.equals(
						FlexFieldSchema.create(FieldKinds.sequence, [
							builder.number,
							builder.boolean,
						]),
					),
				);
				type ListUnion = FlexTreeTypedNode<typeof listUnion>["content"];
				type _check = requireTrue<
					areSafelyAssignable<
						ListUnion,
						FlexTreeSequenceField<
							readonly [typeof builder.number, typeof builder.boolean]
						>
					>
				>;
				// TODO: this should compile: ideally EditableTree's use of AllowedTypes would be compile time order independent like it is runtime order independent, but its currently not.
				type _check2 = requireTrue<
					// @ts-expect-error Currently not order independent: ideally this would compile
					areSafelyAssignable<
						ListUnion,
						FlexTreeSequenceField<
							readonly [typeof builder.boolean, typeof builder.number]
						>
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
					list.info.equals(FlexFieldSchema.create(FieldKinds.sequence, [builder.number])),
				);
				type List = FlexTreeTypedNode<typeof list>["content"];
				type _check = requireTrue<
					areSafelyAssignable<
						List,
						FlexTreeSequenceField<readonly [typeof builder.number]>
					>
				>;

				// Not cached for structural use
				assert((builder.list(builder.number) as FlexTreeNodeSchema) !== list);
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
				assert(mapAny.mapFields.equals(FlexFieldSchema.create(FieldKinds.optional, [Any])));
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
							FlexFieldSchema.create(FieldKinds.optional, [builder.number]),
						),
					);
				});

				it("explicit", () => {
					const builder = new SchemaBuilder({ scope: "scope" });

					const map = builder.map(
						"Foo",
						FlexFieldSchema.create(FieldKinds.sequence, [leaf.string]),
					);
					assert(schemaIsMap(map));
					assert.equal(map.name, `scope.Foo`);
					assert(
						map.mapFields.equals(
							FlexFieldSchema.create(FieldKinds.sequence, [leaf.string]),
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

		function typeTests(x: FlexTreeTypedNode<typeof testObject>) {
			const y: number = x.number;
		}
	});

	it("objectRecursive", () => {
		const builder = new SchemaBuilder({ scope: "Test Recursive Domain" });

		const recursiveObject = builder.objectRecursive("object", {
			recursive: FlexFieldSchema.createUnsafe(FieldKinds.optional, [() => recursiveObject]),
			number: SchemaBuilder.required(builder.number),
		});

		type _0 = requireFalse<isAny<typeof recursiveObject>>;

		function typeTests2(x: FlexTreeTypedNode<typeof recursiveObject>) {
			const y: number = x.number;
			const z: number | undefined = x.recursive?.recursive?.number;
		}
	});
});
