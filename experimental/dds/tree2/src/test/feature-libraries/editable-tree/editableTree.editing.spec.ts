/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import {
	FieldKey,
	GlobalFieldKey,
	JsonableTree,
	LocalFieldKey,
	SchemaData,
	symbolFromKey,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../../../core";
import { ISharedTree } from "../../../shared-tree";
import { brand, clone } from "../../../util";
import {
	singleTextCursor,
	isUnwrappedNode,
	createField,
	getField,
	isEditableField,
	FieldKinds,
	valueSymbol,
	replaceField,
	typeNameSymbol,
	isWritableArrayLike,
	isContextuallyTypedNodeDataObject,
	EditableField,
	getPrimaryField,
	SchemaBuilder,
	FieldKindTypes,
} from "../../../feature-libraries";
import { TestTreeProviderLite } from "../../utils";
import {
	fullSchemaData,
	Person,
	stringSchema,
	Int32,
	getPerson,
	globalFieldSymbolSequencePhones,
	SimplePhones,
	complexPhoneSchema,
	ComplexPhone,
	Address,
	float64Schema,
	Phones,
	phonesSchema,
	personJsonableTree,
	personSchemaLibrary,
} from "./mockData";

const globalFieldKey: GlobalFieldKey = brand("foo");
const globalFieldSymbol = symbolFromKey(globalFieldKey);
// same name to cover global vs local field handling
const localFieldKey: LocalFieldKey = brand("foo");
const rootSchemaName: TreeSchemaIdentifier = brand("Test");

function getTestSchema<Kind extends FieldKindTypes>(fieldKind: Kind): SchemaData {
	const builder = new SchemaBuilder("getTestSchema", personSchemaLibrary);
	const globalField = builder.globalField(
		globalFieldKey,
		SchemaBuilder.field(fieldKind, stringSchema),
	);
	const rootNodeSchema = builder.object("Test", {
		local: {
			[localFieldKey]: SchemaBuilder.field(fieldKind, stringSchema),
		},
		globalFields: [globalFieldKey],
		value: ValueSchema.Serializable,
	});
	return builder.intoDocumentSchema(SchemaBuilder.field(FieldKinds.optional, rootNodeSchema));
}

// TODO: There are two kinds of users of this in this file. Both should be changed:
// Tests which are testing collaboration between multiple trees should be adjusted to not do that, or moved elsewhere (merge/collaboration is not the focus of this file).
// Tests which are using a single tree should just use a MockFluidDataStoreRuntime instead of all the complexity of TestTreeProvider.
function createSharedTrees(
	schemaData: SchemaData,
	data?: JsonableTree[],
	numberOfTrees = 1,
): readonly [TestTreeProviderLite, readonly ISharedTree[]] {
	const provider = new TestTreeProviderLite(numberOfTrees);
	for (const tree of provider.trees) {
		assert(tree.isAttached());
	}
	provider.trees[0].storedSchema.update(schemaData);
	if (data !== undefined) {
		provider.trees[0].context.root.insertNodes(0, data.map(singleTextCursor));
	}
	provider.processMessages();
	return [provider, provider.trees];
}

const testCases: (readonly [string, FieldKey])[] = [
	["a global field", globalFieldSymbol],
	["a local field", localFieldKey],
];

describe("editable-tree: editing", () => {
	it("edit using contextually typed API", () => {
		const [, trees] = createSharedTrees(fullSchemaData, [personJsonableTree()]);
		assert.equal((trees[0].root as Person).name, "Adam");
		// delete optional root
		trees[0].root = undefined;
		assert.equal(trees[0].root, undefined);

		// create optional root
		trees[0].root = { name: "Mike" };
		assert.deepEqual(clone(trees[0].root), { name: "Mike" });

		// replace optional root
		trees[0].root = { name: "Peter", adult: true };

		assert(isContextuallyTypedNodeDataObject(trees[0].root));
		const maybePerson = trees[0].root;
		// unambiguously typed field
		maybePerson.age = 150;

		// polymorphic field supports:
		// - Float64 schema (number-based)
		// - Int32 schema (number-based)
		// - String schema
		maybePerson.salary = {
			[valueSymbol]: "100.1",
			[typeNameSymbol]: stringSchema.name,
		};
		// unambiguous type
		maybePerson.salary = "not ok";
		// ambiguous type since there are multiple options which are numbers:
		assert.throws(
			() => (maybePerson.salary = 99.99),
			(e) =>
				validateAssertionError(
					e,
					"data compatible with more than one type allowed by the schema",
				),
		);
		// explicit typing
		maybePerson.salary = {
			[typeNameSymbol]: float64Schema.name,
			[valueSymbol]: 99.99,
		};

		// Map<String>
		maybePerson.friends = { Anna: "Anna" };
		maybePerson.friends.John = "John";

		maybePerson.address = {
			zip: 345,
			city: "Bonn",
			// polymorphic field (uses Int32, string, ComplexPhone and SimplePhones schemas)
			phones: [
				"+491234567890",
				{
					[typeNameSymbol]: complexPhoneSchema.name,
					prefix: "+49",
					number: "1234567",
				},
			],
		};
		// make sure the value is not set at the primary field parent node
		{
			const person = trees[0].root as Person;
			assert(isUnwrappedNode(person.address));
			const phones = person.address[getField](brand("phones"));
			assert.equal(phones.getNode(0)[valueSymbol], undefined);
		}
		maybePerson.address.street = "unknown";

		// can use strict types to access the data
		assert.equal((maybePerson.address.phones as Phones)[0], "+491234567890");

		assert(isWritableArrayLike(maybePerson.address.phones));
		assert.equal(maybePerson.address.phones[0], "+491234567890");
		assert.equal(Array.isArray(maybePerson.address.phones), false);
		maybePerson.address.phones[0] = "+1234567890";

		// can still use the EditableTree API at children
		{
			const phones: EditableField = maybePerson.address.phones as EditableField;
			assert.equal(
				phones.fieldSchema.kind.identifier,
				getPrimaryField(phonesSchema)?.schema.kind.identifier,
			);
			assert.deepEqual(phones.fieldSchema.types, getPrimaryField(phonesSchema)?.schema.types);
			// can use the contextually typed API again
			phones[1] = {
				[typeNameSymbol]: complexPhoneSchema.name,
				prefix: "+1",
				number: "2345",
			} as unknown as ComplexPhone;
		}

		const globalPhonesKey: FieldKey = globalFieldSymbolSequencePhones;
		maybePerson.address[globalPhonesKey] = ["111"];
		// TypeScript can't this
		// assert(isWritableArrayLike(maybePerson.address[globalField]));
		// maybePerson.address[globalField][1] = "888";
		const globalPhones = maybePerson.address[globalPhonesKey];
		assert(isWritableArrayLike(globalPhones));
		globalPhones[0] = "222";
		globalPhones[1] = "333";
		// explicitly check and delete the global field as `clone` (used below)
		// does not support symbols as property keys
		assert.deepEqual([...globalPhones], ["222", "333"]);
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		delete maybePerson.address[globalPhonesKey];

		const clonedPerson = clone(maybePerson);
		assert.deepEqual(clonedPerson, {
			name: "Peter",
			age: 150,
			adult: true,
			salary: 99.99,
			friends: {
				Anna: "Anna",
				John: "John",
			},
			address: {
				zip: 345,
				city: "Bonn",
				street: "unknown",
				phones: {
					"0": "+1234567890",
					"1": {
						prefix: "+1",
						number: "2345",
					},
				},
			},
		});
	});

	it("edit using typed data model", () => {
		const [, trees] = createSharedTrees(fullSchemaData);

		trees[0].root = getPerson();
		const person = trees[0].root as Person;

		// check initial data
		{
			// explicitly check the global field as `clone` does not support symbols as field keys
			assert.deepEqual(clone(person.address?.[globalFieldSymbolSequencePhones]), {
				"0": "115",
				"1": "116",
			});
			delete person.address?.[globalFieldSymbolSequencePhones];
			const clonedPerson = clone(person);
			assert.deepEqual(clonedPerson, {
				name: "Adam",
				age: 35,
				adult: true,
				salary: 10420.2,
				friends: {
					Mat: "Mat",
				},
				address: {
					zip: "99999",
					street: "treeStreet",
					phones: {
						"0": "+49123456778",
						"1": 123456879,
						"2": {
							prefix: "0123",
							number: "012345",
							extraPhones: { "0": "91919191" },
						},
						"3": {
							"0": "112",
							"1": "113",
						},
					},
					sequencePhones: { "0": "113", "1": "114" },
				},
			});
		}

		{
			delete person.age;
			// create optional field
			person.age = brand(32);

			// replace optional field
			person.address = {
				zip: "99999",
				street: "foo",
				phones: [12345],
			} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping
			assert(person.address !== undefined);

			// create sequence field
			person.address.sequencePhones = brand(["999"]);

			const zip: Int32 = brand(123);
			// replace value field
			person.address.zip = zip;

			const clonedAddress = clone(person.address);
			assert.deepEqual(clonedAddress, {
				street: "foo",
				zip: 123,
				phones: {
					"0": 12345,
				},
				sequencePhones: {
					"0": "999",
				},
			});

			// replace sequence field
			person.address.sequencePhones = brand(["111"]);
			// replace array (optional field with primary sequence field)
			person.address.phones = brand(["54321"]);
			assert(person.address.phones !== undefined);
			const simplePhones: SimplePhones = brand(["555"]);
			// create node as array (node has a primary field)
			person.address.phones[1] = simplePhones;
			// create primitive node
			person.address.phones[2] = brand(3);
			const clonedPerson = clone(person);
			assert.deepEqual(clonedPerson, {
				name: "Adam",
				age: 32,
				adult: true,
				salary: 10420.2,
				friends: {
					Mat: "Mat",
				},
				address: {
					street: "foo",
					zip: 123,
					phones: {
						"0": "54321",
						"1": {
							"0": "555",
						},
						"2": 3,
					},
					sequencePhones: {
						"0": "111",
					},
				},
			});
			// replace node
			person.address.phones[1] = {
				[typeNameSymbol]: complexPhoneSchema.name,
				number: "123",
				prefix: "456",
				extraPhones: ["1234567"],
			} as unknown as ComplexPhone; // TODO: fix up these strong types to reflect unwrapping
			assert.deepEqual(clone(person.address.phones), {
				"0": "54321",
				"1": { number: "123", prefix: "456", extraPhones: { "0": "1234567" } },
				"2": 3,
			});
		}
	});

	it("validates schema of values", () => {
		const builder = new SchemaBuilder("getTestSchema", personSchemaLibrary);
		const schemaData = builder.intoDocumentSchema(
			SchemaBuilder.field(FieldKinds.value, stringSchema),
		);

		const [, trees] = createSharedTrees(schemaData, [{ type: stringSchema.name, value: "x" }]);
		const root = trees[0].context.root.getNode(0);
		// Confirm stetting value to a string does not error
		root[valueSymbol] = "hi";
		// Conform setting value to something out of schema does error
		assert.throws(() => (root[valueSymbol] = { kate: "kate" }));
		assert.throws(() => (root[valueSymbol] = 5));
		assert.throws(() => (root[valueSymbol] = true));
		assert.throws(() => (root[valueSymbol] = undefined));
		// This is not dynamic delete: valueSymbol is a constant symbol.
		// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
		assert.throws(() => delete root[valueSymbol]);
		trees[0].context.free();
	});

	describe(`can move nodes`, () => {
		it("to the left within the same field", () => {
			const [provider, trees] = createSharedTrees(getTestSchema(FieldKinds.sequence), [
				{ type: rootSchemaName },
			]);
			assert(isUnwrappedNode(trees[0].root));
			// create using `createFieldSymbol`
			trees[0].root[createField](localFieldKey, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			const field_0 = trees[0].root[localFieldKey];
			assert(isEditableField(field_0));
			assert.deepEqual([...field_0], ["foo", "bar"]);

			// move node
			field_0.moveNodes(1, 1, 0);

			// check that node was moved from field_0
			assert.deepEqual([...field_0], ["bar", "foo"]);
		});
		it("to the right within the same field", () => {
			const [provider, trees] = createSharedTrees(getTestSchema(FieldKinds.sequence), [
				{ type: rootSchemaName },
			]);
			assert(isUnwrappedNode(trees[0].root));
			// create using `createFieldSymbol`
			trees[0].root[createField](localFieldKey, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			const field_0 = trees[0].root[localFieldKey];
			assert(isEditableField(field_0));
			assert.deepEqual([...field_0], ["foo", "bar"]);

			// move node
			field_0.moveNodes(0, 1, 1);

			// check that node was moved from field_0
			assert.deepEqual([...field_0], ["bar", "foo"]);
		});
		it("to a different field", () => {
			const [provider, trees] = createSharedTrees(getTestSchema(FieldKinds.sequence), [
				{ type: rootSchemaName },
			]);
			assert(isUnwrappedNode(trees[0].root));
			// create using `createFieldSymbol`
			trees[0].root[createField](localFieldKey, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			trees[0].root[createField](globalFieldSymbol, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			const field_0 = trees[0].root[localFieldKey];
			assert(isEditableField(field_0));
			assert.deepEqual([...field_0], ["foo", "bar"]);

			const field_1 = trees[0].root[globalFieldSymbol];
			assert(isEditableField(field_1));
			assert.deepEqual([...field_1], ["foo", "bar"]);

			// move node
			field_0.moveNodes(0, 1, 1, field_1);

			// check that node was moved out from field_0
			assert.deepEqual([...field_0], ["bar"]);

			// check that node was moved into field_1
			assert.deepEqual([...field_1], ["foo", "foo", "bar"]);
		});
	});

	for (const [fieldDescription, fieldKey] of testCases) {
		describe(`can create, edit, move and delete ${fieldDescription}`, () => {
			it("as sequence field", () => {
				const [provider, trees] = createSharedTrees(
					getTestSchema(FieldKinds.sequence),
					[{ type: rootSchemaName }],
					2,
				);
				assert(isUnwrappedNode(trees[0].root));
				assert(isUnwrappedNode(trees[1].root));
				// create using `createFieldSymbol`
				trees[0].root[createField](fieldKey, [
					singleTextCursor({ type: stringSchema.name, value: "foo" }),
					singleTextCursor({ type: stringSchema.name, value: "bar" }),
				]);
				const field_0 = trees[0].root[fieldKey];
				assert(isEditableField(field_0));
				assert.equal(field_0.length, 2);
				assert.equal(field_0[0], "foo");
				assert.equal(field_0[1], "bar");
				assert.equal(field_0[2], undefined);
				provider.processMessages();
				const field_1 = trees[1].root[fieldKey];
				assert.deepEqual(field_0, field_1);

				// edit using assignment
				field_0[0] = "buz";
				assert.equal(field_0[0], "buz");
				provider.processMessages();
				assert.deepEqual(field_0, field_1);

				// edit using valueSymbol
				field_0.getNode(0)[valueSymbol] = "via symbol";
				assert.equal(field_0[0], "via symbol");
				provider.processMessages();
				assert.deepEqual(field_0, field_1);

				// delete
				assert.throws(
					() => {
						delete field_0[0];
					},
					(e) => validateAssertionError(e, "Not supported. Use `deleteNodes()` instead"),
					"Expected exception was not thrown",
				);
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete trees[0].root[fieldKey];
				assert(!(fieldKey in trees[0].root));
				assert.equal(field_0[0], undefined);
				assert.equal(field_0.length, 0);
				provider.processMessages();
				assert.deepEqual(field_0, field_1);

				// create using `insertNodes()`
				[
					singleTextCursor({ type: stringSchema.name, value: "third" }),
					singleTextCursor({ type: stringSchema.name, value: "second" }),
					singleTextCursor({ type: stringSchema.name, value: "first" }),
				].forEach((content) => field_0.insertNodes(0, content));
				assert.throws(
					() => field_0.insertNodes(5, singleTextCursor({ type: stringSchema.name })),
					(e) => validateAssertionError(e, "Index must be less than or equal to length."),
					"Expected exception was not thrown",
				);
				assert.equal(field_0[0], "first");
				assert.equal(field_0[1], "second");
				provider.processMessages();
				assert.deepEqual(field_0, field_1);

				// edit using `replaceNodes()`
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete trees[0].root[fieldKey];
				assert.throws(
					() => field_0.replaceNodes(1, singleTextCursor({ type: stringSchema.name })),
					(e) =>
						validateAssertionError(
							e,
							"Index must be less than length or, if the field is empty, be 0.",
						),
					"Expected exception was not thrown",
				);
				assert(isEditableField(field_1));
				for (let index = 0; index < field_1.length; index++) {
					field_0[index] = field_1[index];
				}
				assert.throws(
					() => field_0.replaceNodes(5, singleTextCursor({ type: stringSchema.name })),
					(e) =>
						validateAssertionError(
							e,
							"Index must be less than length or, if the field is empty, be 0.",
						),
					"Expected exception was not thrown",
				);
				field_0.replaceNodes(
					1,
					singleTextCursor({ type: stringSchema.name, value: "changed" }),
					1,
				);
				assert.equal(field_0[1], "changed");
				provider.processMessages();
				assert.deepEqual(field_0, field_1);

				const firstNodeBeforeMove = field_0[0];
				// move using `moveNodes()`
				field_0.moveNodes(0, 1, 1);
				const secondNodeAfterMove = field_0[1];
				assert.equal(firstNodeBeforeMove, secondNodeAfterMove);

				// delete using `deleteNodes()`
				field_0.deleteNodes(1, 1);
				assert.throws(
					() => field_0.deleteNodes(2),
					(e) => validateAssertionError(e, "Index must be less than length."),
					"Expected exception was not thrown",
				);
				assert.equal(field_0.length, 2);
				assert.throws(
					() => field_0.deleteNodes(0, -1),
					(e) => validateAssertionError(e, "Count must be non-negative."),
					"Expected exception was not thrown",
				);
				provider.processMessages();
				assert.deepEqual(field_0, field_1);
				field_0.deleteNodes(0, 5);
				assert.equal(field_0.length, 0);
				assert(!(fieldKey in trees[0].root));
				assert.doesNotThrow(() => field_0.deleteNodes(0, 0));
				provider.processMessages();
				assert.deepEqual(field_0, field_1);

				trees[0].context.free();
				trees[1].context.free();
			});

			it("as optional field", () => {
				const [provider, trees] = createSharedTrees(
					getTestSchema(FieldKinds.optional),
					[{ type: rootSchemaName }],
					2,
				);
				assert(isUnwrappedNode(trees[0].root));
				assert(isUnwrappedNode(trees[1].root));

				// create
				assert.throws(
					() => {
						assert(isUnwrappedNode(trees[0].root));
						trees[0].root[createField](fieldKey, [
							singleTextCursor({ type: stringSchema.name, value: "foo" }),
							singleTextCursor({ type: stringSchema.name, value: "foo" }),
						]);
					},
					(e) =>
						validateAssertionError(e, "Use single cursor to create the optional field"),
					"Expected exception was not thrown",
				);
				trees[0].root[createField](
					fieldKey,
					singleTextCursor({ type: stringSchema.name, value: "foo" }),
				);
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "foo");

				// edit using assignment
				trees[0].root[fieldKey] = "bar";
				provider.processMessages();
				assert.equal(trees[0].root[fieldKey], "bar");

				// edit using valueSymbol
				trees[0].root[getField](fieldKey).getNode(0)[valueSymbol] = "via symbol";
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "via symbol");

				// edit using `replaceField()`
				trees[0].root[replaceField](
					fieldKey,
					singleTextCursor({ type: stringSchema.name, value: "replaced" }),
				);
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "replaced");

				// delete
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete trees[0].root[fieldKey];
				assert(!(fieldKey in trees[0].root));
				provider.processMessages();
				assert(!(fieldKey in trees[1].root));
				assert.equal(trees[0].root[fieldKey], undefined);
				trees[0].context.free();
				trees[1].context.free();
			});

			it("as value field", () => {
				const [provider, trees] = createSharedTrees(
					getTestSchema(FieldKinds.value),
					[{ type: rootSchemaName }],
					2,
				);
				assert(isUnwrappedNode(trees[0].root));
				assert(isUnwrappedNode(trees[1].root));

				// create
				const fieldContent = singleTextCursor({
					type: stringSchema.name,
					value: "foo",
				});
				assert.throws(
					() => {
						assert(isUnwrappedNode(trees[0].root));
						trees[0].root[createField](fieldKey, fieldContent);
					},
					(e) =>
						validateAssertionError(
							e,
							"It is invalid to create fields of kind `value` as they should always exist.",
						),
					"Expected exception was not thrown",
				);
				// TODO: rework/remove this as soon as trees with value fields will be supported.
				trees[0].root[getField](fieldKey).insertNodes(0, fieldContent);
				assert.equal(trees[0].root[fieldKey], "foo");
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "foo");

				// edit using assignment
				trees[0].root[fieldKey] = "bar";
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "bar");

				// edit using valueSymbol
				trees[0].root[getField](fieldKey).getNode(0)[valueSymbol] = "via symbol";
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "via symbol");

				// edit using `replaceField()`
				trees[0].root[replaceField](
					fieldKey,
					singleTextCursor({ type: stringSchema.name, value: "replaced" }),
				);
				provider.processMessages();
				assert.equal(trees[1].root[fieldKey], "replaced");

				// delete
				assert.throws(
					() => {
						assert(isUnwrappedNode(trees[0].root));
						// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
						delete trees[0].root[fieldKey];
					},
					(e) => validateAssertionError(e, "Fields of kind `value` may not be deleted."),
					"Expected exception was not thrown",
				);

				trees[0].context.free();
				trees[1].context.free();
			});
		});
	}
});
