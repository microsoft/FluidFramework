/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SchemaBuilder } from "../../domains";
import {
	Any,
	FieldKinds,
	FieldSchema,
	Sequence2,
	TreeSchema,
	schemaIsFieldNode,
} from "../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { UnboxNode } from "../../feature-libraries/editable-tree-2/editableTreeTypes";
import { areSafelyAssignable, requireTrue } from "../../util";

describe("domains - SchemaBuilder", () => {
	describe("list", () => {
		describe("structural", () => {
			it("Any", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const listAny = builder.list(Any);
				assert(schemaIsFieldNode(listAny));
				assert.equal(listAny.name, "scope.List<Any>");
				assert(
					listAny.structFields
						.get("")
						.equals(FieldSchema.create(FieldKinds.sequence, [Any])),
				);
				type ListAny = UnboxNode<typeof listAny>;
				type _check = requireTrue<areSafelyAssignable<ListAny, Sequence2<readonly [Any]>>>;

				assert.equal(builder.list(Any), listAny);
			});

			it("never", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const listNever = builder.list([]);
				assert(schemaIsFieldNode(listNever));
				assert.equal(listNever.name, "scope.List<[]>");
				assert(
					listNever.structFields
						.get("")
						.equals(FieldSchema.create(FieldKinds.sequence, [])),
				);
				type ListAny = UnboxNode<typeof listNever>;
				type _check = requireTrue<areSafelyAssignable<ListAny, Sequence2<readonly []>>>;

				assert.equal(builder.list([]), listNever);
			});

			it("implicit", () => {
				const builder = new SchemaBuilder({ scope: "scope2" });

				const listImplicit = builder.list(builder.number);
				assert(schemaIsFieldNode(listImplicit));
				assert.equal(listImplicit.name, `scope2.List<["${builder.number.name}"]>`);
				assert(
					listImplicit.structFields
						.get("")
						.equals(FieldSchema.create(FieldKinds.sequence, [builder.number])),
				);
				type ListAny = UnboxNode<typeof listImplicit>;
				type _check = requireTrue<
					areSafelyAssignable<ListAny, Sequence2<readonly [typeof builder.number]>>
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
					listUnion.structFields
						.get("")
						.equals(
							FieldSchema.create(FieldKinds.sequence, [
								builder.number,
								builder.boolean,
							]),
						),
				);
				type ListAny = UnboxNode<typeof listUnion>;
				type _check = requireTrue<
					areSafelyAssignable<
						ListAny,
						Sequence2<readonly [typeof builder.number, typeof builder.boolean]>
					>
				>;
				// TODO: this should compile: ideally EditableTree's use of AllowedTypes would be compile time order independent like it is runtime order independent, but its currently not.
				type _check2 = requireTrue<
					// @ts-expect-error Currently not order independent: ideally this would compile
					areSafelyAssignable<
						ListAny,
						Sequence2<readonly [typeof builder.boolean, typeof builder.number]>
					>
				>;

				assert.equal(builder.list([builder.number, builder.boolean]), listUnion);
				assert.equal(builder.list([builder.boolean, builder.number]), listUnion);
			});

			it("escaped names", () => {
				const builder = new SchemaBuilder({ scope: "scope" });
				const doubleName = builder.struct(`bar","scope.foo`, {});

				const listDoubleName = builder.list(doubleName);
				assert(schemaIsFieldNode(listDoubleName));
				assert.equal(listDoubleName.name, `scope.List<["scope.bar\\",\\"scope.foo"]>`);

				// This escaping ensures named don't collide:
				const foo = builder.struct("foo", {});
				const bar = builder.struct("bar", {});
				const listUnion = builder.list([bar, foo]);
				assert(listUnion.name !== listDoubleName.name);
			});
		});

		it("named list", () => {
			it("implicit normalizes", () => {
				const builder = new SchemaBuilder({ scope: "scope" });

				const list = builder.list("Foo", builder.number);
				assert(schemaIsFieldNode(list));
				assert.equal(list.name, `scope2.Foo`);
				assert(
					list.structFields
						.get("")
						.equals(FieldSchema.create(FieldKinds.sequence, [builder.number])),
				);
				type ListAny = UnboxNode<typeof list>;
				type _check = requireTrue<
					areSafelyAssignable<ListAny, Sequence2<readonly [typeof builder.number]>>
				>;

				// Not cached for structural use
				assert((builder.list(builder.number) as TreeSchema) !== list);
				// Creating again errors instead or reuses
				assert.throws(() => builder.list("Foo", builder.number));
			});
		});
	});
});
