/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { FieldKey, TreeSchemaIdentifier } from "../../../core";
import { brand, clone } from "../../../util";
import {
	singleTextCursor,
	isEditableTree,
	getField,
	isEditableField,
	FieldKinds,
	valueSymbol,
	typeNameSymbol,
	getPrimaryField,
	SchemaBuilder,
	FieldKind,
	UnwrappedEditableField,
	setField,
	EditableTree,
	treeStatus,
	TreeStatus,
	FieldSchema,
	on,
} from "../../../feature-libraries";
import { viewWithContent } from "../../utils";
import {
	fullSchemaData,
	Person,
	stringSchema,
	Int32,
	getPerson,
	SimplePhones,
	complexPhoneSchema,
	ComplexPhone,
	Address,
	float64Schema,
	Phones,
	phonesSchema,
	personSchemaLibrary,
} from "./mockData";

const localFieldKey: FieldKey = brand("foo");
const otherFieldKey: FieldKey = brand("foo2");

const rootSchemaName: TreeSchemaIdentifier = brand("Test");

function getTestSchema<Kind extends FieldKind>(fieldKind: Kind) {
	const builder = new SchemaBuilder({ scope: "getTestSchema", libraries: [personSchemaLibrary] });
	const rootNodeSchema = builder.struct("Test", {
		foo: FieldSchema.create(fieldKind, [stringSchema]),
		foo2: FieldSchema.create(fieldKind, [stringSchema]),
	});
	return builder.toDocumentSchema(FieldSchema.create(FieldKinds.optional, [rootNodeSchema]));
}

describe("editable-tree: editing", () => {
	it("edit using contextually typed API", () => {
		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
		assert.equal((tree.root as Person).name, "Adam");
		// delete optional root
		tree.setContent(undefined);
		assert.equal(tree.root, undefined);

		// create optional root
		tree.setContent({ name: "Mike" });
		assert.deepEqual(clone(tree.root, { lossy: true }), { name: "Mike" });

		// replace optional root
		tree.setContent({ name: "Peter", adult: true });

		// `as` cast here un-narrows the type which typescript incorrectly infers as undefined due to assert above.
		const maybePerson: UnwrappedEditableField = tree.root as UnwrappedEditableField;
		assert(isEditableTree(maybePerson));
		// unambiguously typed field
		maybePerson.age = 150;

		// polymorphic field supports:
		// - Float64 schema (number-based)
		// - Int32 schema (number-based)
		// - String schema
		maybePerson.salary = {
			[valueSymbol]: "100.1",
			[typeNameSymbol]: stringSchema.name,
		} as any; // TODO: schema aware typing.
		// unambiguous type
		maybePerson.salary = "not ok";
		// ambiguous type since there are multiple options which are numbers:
		assert.throws(
			() => (maybePerson.salary = 99.99),
			(e: Error) =>
				validateAssertionError(
					e,
					"data compatible with more than one type allowed by the schema",
				),
		);
		// explicit typing
		maybePerson.salary = {
			[typeNameSymbol]: float64Schema.name,
			[valueSymbol]: 99.99,
		} as any; // TODO: schema aware typing.

		// Map<String>
		maybePerson.friends = { Anna: "Anna" } as any; // TODO: schema aware typing.
		(maybePerson.friends as EditableTree).John = "John" as any; // TODO: schema aware typing.

		maybePerson[setField](brand("address"), {
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
		});
		// make sure the value is not set at the primary field parent node
		{
			const person = tree.root as unknown as Person;
			assert(isEditableTree(person.address));
			const phones = person.address[getField](brand("phones"));
			assert.equal(phones.getNode(0)[valueSymbol], undefined);
		}
		// TODO: schema aware typing.
		(maybePerson.address as EditableTree).street = "unknown";

		{
			// TODO: schema aware typing.
			const phones = (maybePerson.address as EditableTree).phones;
			assert(isEditableField(phones));

			// can use strict types to access the data
			assert.equal((phones as Phones)[0], "+491234567890");

			assert.equal(phones[0], "+491234567890");
			assert.equal(Array.isArray(phones), false);
			phones[0] = "+1234567890";

			// can still use the EditableTree API at children
			{
				assert.equal(
					phones.fieldSchema.kind.identifier,
					getPrimaryField(phonesSchema)?.schema.kind.identifier,
				);
				assert.deepEqual(
					phones.fieldSchema.types,
					getPrimaryField(phonesSchema)?.schema.types,
				);
				// can use the contextually typed API again
				phones[1] = {
					[typeNameSymbol]: complexPhoneSchema.name,
					prefix: "+1",
					number: "2345",
				} as unknown as ComplexPhone;
			}
		}

		const clonedPerson = clone(maybePerson, { lossy: true });
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
		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
		const person = tree.root as Person;

		// check initial data
		{
			const clonedPerson = clone(person, { lossy: true });
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

			const clonedAddress = clone(person.address, { lossy: true });
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
			const clonedPerson = clone(person, { lossy: true });
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
			assert.deepEqual(clone(person.address.phones, { lossy: true }), {
				"0": "54321",
				"1": { number: "123", prefix: "456", extraPhones: { "0": "1234567" } },
				"2": 3,
			});
		}
	});

	it.only("events on nodes", () => {
		const tree = viewWithContent({ schema: fullSchemaData, initialTree: getPerson() });
		const person = tree.root as EditableTree;

		let beforeChangePersonCount = 0;
		let afterChangePersonCount = 0;
		let beforeChangeAddressCount = 0;
		let afterChangeAddressCount = 0;
		// let beforeChangeAgeCount = 0;
		// let afterChangeAgeCount = 0;
		// let beforeChangeZipCount = 0;
		// let afterChangeZipCount = 0;

		person[on]("beforeChange", (event) => {
			beforeChangePersonCount++;
		});
		person[on]("subtreeChanging", (event) => {
			// TODO: this fails because subtreeChanging is emitted twice, one for each pass of the delta visit, and on the
			// second time both before and after could have fired already.
			// assert.strictEqual(
			// 	beforeChangePersonCount,
			// 	afterChangePersonCount + 1,
			// 	"person subtreeChanging",
			// );
		});
		person[on]("afterChange", (event) => {
			afterChangePersonCount++;
		});
		// (person.age as EditableTree)[on]("beforeChange", (event) => {
		// 	beforeChangeAgeCount++;
		// });
		// (person.age as EditableTree)[on]("subtreeChanging", (event) => {
		// 	// TODO: this fails because subtreeChanging is emitted twice, one for each pass of the delta visit, and on the
		// 	// second time both before and after could have fired already.
		// 	// assert.strictEqual(
		// 	// 	beforeChangeAgeCount,
		// 	// 	afterChangeAgeCount + 1,
		// 	// 	"age subtreeChanging",
		// 	// );
		// });
		// (person.age as EditableTree)[on]("afterChange", (event) => {
		// 	afterChangeAgeCount++;
		// });
		(person.address as EditableTree)[on]("beforeChange", (event) => {
			beforeChangeAddressCount++;
		});
		(person.address as EditableTree)[on]("subtreeChanging", (event) => {
			// TODO: this fails because subtreeChanging is emitted twice, one for each pass of the delta visit, and on the
			// second time both before and after could have fired already.
			// assert.strictEqual(
			// 	beforeChangeAddressCount,
			// 	afterChangeAddressCount + 1,
			// 	"address subtreeChanging",
			// );
		});
		(person.address as EditableTree)[on]("afterChange", (event) => {
			afterChangeAddressCount++;
		});
		// TODO: can't register event handlers on person.address.zip ?
		// TypeError: person.address.zip[feature_libraries_1.on] is not a function
		// ((person.address as EditableTree).zip as EditableTree)[on]("beforeChange", (event) => {
		// 	beforeChangeZipCount++;
		// });
		// ((person.address as EditableTree).zip as EditableTree)[on]("subtreeChanging", (event) => {
		// 	// TODO: this fails because subtreeChanging is emitted twice, one for each pass of the delta visit, and on the
		// 	// second time both before and after could have fired already.
		// 	// assert.strictEqual(
		// 	// 	beforeChangeZipCount,
		// 	// 	afterChangeZipCount + 1,
		// 	// 	"zip subtreeChanging",
		// 	// );
		// });
		// ((person.address as EditableTree).zip as EditableTree)[on]("afterChange", (event) => {
		// 	afterChangeZipCount++;
		// });

		// Validate initial state pre-test
		// assert.strictEqual(beforeChangeZipCount, 0);
		// assert.strictEqual(afterChangeZipCount, 0);

		{
			assert.strictEqual(beforeChangePersonCount, 0);
			assert.strictEqual(afterChangePersonCount, 0);

			person.age = brand<Int32>(32);

			assert.strictEqual(beforeChangePersonCount, 1);
			assert.strictEqual(afterChangePersonCount, 1);

			person.address = {
				zip: "99999",
				street: "foo",
				phones: [12345],
			} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping

			assert.strictEqual(beforeChangePersonCount, 2);
			assert.strictEqual(afterChangePersonCount, 2);

			// // create sequence field
			// person.address.sequencePhones = brand(["999"]);

			// assert.strictEqual(beforeChangeZipCount, 0);
			// assert.strictEqual(afterChangeZipCount, 0);
			const zip = brand<Int32>(123);
			// replace value field
			person.address.zip = zip;
			// assert.strictEqual(beforeChangeZipCount, 1);
			// assert.strictEqual(afterChangeZipCount, 1);

			assert.strictEqual(beforeChangePersonCount, 3);
			assert.strictEqual(afterChangePersonCount, 3);

			// Update the whole address again
			person.address = {
				zip: "99999",
				street: "foo",
				phones: [12345],
			} as unknown as Address; // TODO: fix up these strong types to reflect unwrapping

			assert.strictEqual(beforeChangePersonCount, 4);
			assert.strictEqual(afterChangePersonCount, 4);

			// Verify final counts
			// - 4 fired the root (person) (changed person.address twice, person.age once, person.address.zip once)
			// - 1 fired for person.age // TODO: can't register events on it?
			// - 1 fired for person.address // TODO: can't register events on it?
			// - 1 fired for person.address.zip // TODO: can't register events on it?
			assert.strictEqual(beforeChangePersonCount, 4);
			assert.strictEqual(afterChangePersonCount, 4);
			// assert.strictEqual(beforeChangeAgeCount, 1);
			// assert.strictEqual(afterChangeAgeCount, 1);
			assert.strictEqual(beforeChangeAddressCount, 0);
			assert.strictEqual(afterChangeAddressCount, 0);
			// assert.strictEqual(beforeChangeZipCount, 1);
			// assert.strictEqual(afterChangeZipCount, 1);

			// // replace sequence field
			// person.address.sequencePhones = brand(["111"]);
			// // replace array (optional field with primary sequence field)
			// person.address.phones = brand(["54321"]);
			// assert(person.address.phones !== undefined);
			// const simplePhones: SimplePhones = brand(["555"]);
			// // create node as array (node has a primary field)
			// person.address.phones[1] = simplePhones;
			// // create primitive node
			// person.address.phones[2] = brand(3);

			// // replace node
			// person.address.phones[1] = {
			// 	[typeNameSymbol]: complexPhoneSchema.name,
			// 	number: "123",
			// 	prefix: "456",
			// 	extraPhones: ["1234567"],
			// } as unknown as ComplexPhone; // TODO: fix up these strong types to reflect unwrapping
			// assert.deepEqual(clone(person.address.phones, { lossy: true }), {
			// 	"0": "54321",
			// 	"1": { number: "123", prefix: "456", extraPhones: { "0": "1234567" } },
			// 	"2": 3,
			// });
		}
	});

	describe(`can move nodes`, () => {
		it("to the left within the same field", () => {
			const tree = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			assert(isEditableTree(tree.root));
			// create using `insertNodes`
			tree.root[getField](localFieldKey).insertNodes(0, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			const field_0 = tree.root[localFieldKey];
			assert(isEditableField(field_0));
			assert.deepEqual([...field_0], ["foo", "bar"]);

			// move node
			field_0.moveNodes(1, 1, 0);

			// check that node was moved from field_0
			assert.deepEqual([...field_0], ["bar", "foo"]);
		});
		it("to the right within the same field", () => {
			const tree = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			assert(isEditableTree(tree.root));
			// create using `insertNodes`
			tree.root[getField](localFieldKey).insertNodes(0, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			const field_0 = tree.root[localFieldKey];
			assert(isEditableField(field_0));
			assert.deepEqual([...field_0], ["foo", "bar"]);

			// move node
			field_0.moveNodes(0, 1, 1);

			// check that node was moved from field_0
			assert.deepEqual([...field_0], ["bar", "foo"]);
		});
		it("to a different field", () => {
			const tree = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			assert(isEditableTree(tree.root));
			// create using `insertNodes`
			tree.root[getField](localFieldKey).insertNodes(0, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			tree.root[getField](otherFieldKey).insertNodes(0, [
				singleTextCursor({ type: stringSchema.name, value: "foo" }),
				singleTextCursor({ type: stringSchema.name, value: "bar" }),
			]);
			const field_0 = tree.root.foo;
			assert(isEditableField(field_0));
			assert.deepEqual([...field_0], ["foo", "bar"]);

			const field_1 = tree.root[otherFieldKey];
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

	describe(`can create, edit, move and delete`, () => {
		it("insertNodes in a sequence field", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[localFieldKey];
			assert(isEditableField(field));

			// create using `insertNodes`
			field.insertNodes(0, ["foo", "bar"]);
			assert.deepEqual([...field], ["foo", "bar"]);

			field.remove();
			// create using `insertNodes()`
			["third", "second", "first"].forEach((content) => field.insertNodes(0, [content]));
			assert.deepEqual([...field], ["first", "second", "third"]);
			assert.throws(
				() => field.insertNodes(5, ["x"]),
				(e: Error) =>
					validateAssertionError(e, "Index must be less than or equal to length."),
				"Expected exception was not thrown",
			);
		});

		it("replaceNodes in a sequence field", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[localFieldKey];
			assert(isEditableField(field));

			assert.throws(
				() => field.replaceNodes(1, ["x"]),
				(e: Error) =>
					validateAssertionError(
						e,
						"Index must be less than length or, if the field is empty, be 0.",
					),
				"Expected exception was not thrown",
			);

			field.setContent(["a", "b", "c"]);
			field.replaceNodes(1, ["changed"], 1);
			assert.deepEqual([...field], ["a", "changed", "c"]);
			field.replaceNodes(0, [], 1);
			assert.deepEqual([...field], ["changed", "c"]);
			field.replaceNodes(1, ["x", "y"], 0);
			assert.deepEqual([...field], ["changed", "x", "y", "c"]);
		});

		it("moveNodes in a sequence field", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: ["a", "b", "c"], foo2: [] },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[localFieldKey];
			assert(isEditableField(field));

			const firstNodeBeforeMove = field[0];
			// move using `moveNodes()`
			field.moveNodes(0, 1, 1);
			const secondNodeAfterMove = field[1];
			assert.equal(firstNodeBeforeMove, secondNodeAfterMove);
			assert.deepEqual([...field], ["b", "a", "c"]);
		});

		it("assignment and deletion on sequence field", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[getField](localFieldKey);
			assert.deepEqual([...field], []);

			// Using .content
			field.setContent(["foo", "foo"]);
			assert.deepEqual([...field], ["foo", "foo"]);
			field.setContent([]);
			assert.deepEqual([...field], []);
			field.setContent(["foo"]);
			assert.deepEqual([...field], ["foo"]);

			// edit using assignment
			root[localFieldKey] = ["1"] as any; // Can't be type safe to to index signature variance limitation.
			assert.deepEqual([...field], ["1"]);

			// edit using indexing
			field[0] = "replaced";
			assert.deepEqual([...field], ["replaced"]);

			// delete
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete root[localFieldKey];
			assert(!(localFieldKey in root));
			assert.deepEqual([...field], []);

			// Restore
			field.setContent(["bar"]);
			assert.deepEqual([...field], ["bar"]);

			// delete assignment
			assert.throws(() => {
				root[localFieldKey] = undefined;
			});

			// delete content assignment
			assert.throws(() => {
				field.setContent(undefined);
			});

			// remove method
			field.remove();
			assert(!(localFieldKey in root));
			assert.deepEqual([...field], []);
		});

		it("regression test for sequence setting empty sequence", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.sequence),
				initialTree: { foo: [], foo2: [] },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[getField](localFieldKey);
			field.setContent([]);
			assert.deepEqual([...field], []);
		});

		it("as optional field", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.optional),
				initialTree: { foo: undefined, foo2: undefined },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[getField](localFieldKey);
			assert.equal(field.content, undefined);
			assert.equal(root[localFieldKey], undefined);

			// create
			assert.throws(
				() => {
					assert(isEditableTree(root));
					field.setContent(["foo", "foo"]);
				},
				(e: Error) => validateAssertionError(e, /incompatible/),
			);

			// Using .content
			field.setContent("foo");
			assert.equal(root[localFieldKey], "foo");
			{
				const child = field.content;
				assert(isEditableTree(child));
				assert.equal(child[valueSymbol], "foo");
			}

			// edit using assignment
			root[localFieldKey] = "bar";
			assert.equal(root[localFieldKey], "bar");

			// edit using indexing
			field[0] = "replaced";
			assert.equal(root[localFieldKey], "replaced");

			// delete
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete root[localFieldKey];
			assert(!(localFieldKey in root));
			assert.equal(root[localFieldKey], undefined);

			// Restore
			root[localFieldKey] = "bar";
			assert.equal(root[localFieldKey], "bar");

			// delete assignment
			root[localFieldKey] = undefined;
			assert(!(localFieldKey in root));
			assert.equal(root[localFieldKey], undefined);

			// Restore
			root[localFieldKey] = "bar";
			assert.equal(root[localFieldKey], "bar");

			// delete content assignment
			field.setContent(undefined);
			assert(!(localFieldKey in root));
			assert.equal(root[localFieldKey], undefined);

			// Restore
			root[localFieldKey] = "bar";
			assert.equal(root[localFieldKey], "bar");

			// remove method
			field.remove();
			assert(!(localFieldKey in root));
			assert.equal(root[localFieldKey], undefined);
		});

		it("as value field", () => {
			const view = viewWithContent({
				schema: getTestSchema(FieldKinds.required),
				initialTree: { foo: "initial", foo2: "" },
			});
			const root = view.root;
			assert(isEditableTree(root));
			const field = root[getField](localFieldKey);
			assert.equal(root[localFieldKey], "initial");

			// create
			assert.throws(
				() => {
					assert(isEditableTree(root));
					field.setContent(["foo", "foo"]);
				},
				(e: Error) => validateAssertionError(e, /incompatible/),
			);

			// Using .content
			field.setContent("foo");
			assert.equal(root[localFieldKey], "foo");

			// edit using assignment
			root[localFieldKey] = "bar";
			assert.equal(root[localFieldKey], "bar");

			// edit using indexing
			field[0] = "replaced";
			assert.equal(root[localFieldKey], "replaced");

			// delete
			assert.throws(() => {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete root[localFieldKey];
			});

			// delete assignment
			assert.throws(() => {
				root[localFieldKey] = undefined;
			});

			// delete content assignment
			assert.throws(() => {
				field.setContent(undefined);
			});

			// remove method
			assert.throws(() => {
				field.remove();
			});
		});
	});

	describe("treeStatus", () => {
		describe("EditableTree", () => {
			it("root node and non-root node returns TreeStatus.InDocument", () => {
				const view = viewWithContent({
					schema: getTestSchema(FieldKinds.sequence),
					initialTree: { foo: ["foo"], foo2: [] },
				});
				const rootNode = view.root;
				assert(isEditableTree(rootNode));
				const rootNodeStatus = rootNode[treeStatus]();
				assert.equal(rootNodeStatus, TreeStatus.InDocument);

				const field = rootNode[localFieldKey];
				assert(isEditableField(field));
				const node = field.getNode(0);
				const nodeStatus = node[treeStatus]();
				assert.equal(nodeStatus, TreeStatus.InDocument);
			});

			it("removed node returns TreeStatus.Removed on itself and its contents", () => {
				const view = viewWithContent({
					schema: getTestSchema(FieldKinds.sequence),
					initialTree: { foo: ["foo"], foo2: [] },
				});
				const root = view.root;
				assert(isEditableTree(root));
				const field = root[localFieldKey];
				assert(isEditableField(field));

				// Check TreeStatus before remove.
				const rootStatusBeforeRemove = root[treeStatus]();
				assert.equal(rootStatusBeforeRemove, TreeStatus.InDocument);

				const node = field.getNode(0);
				const nodeStatusBeforeRemove = node[treeStatus]();
				assert.equal(nodeStatusBeforeRemove, TreeStatus.InDocument);

				const rootField = view.context.root;
				rootField.remove();

				// Check TreeStatus after remove.
				const rootStatusAfterRemove = root[treeStatus]();
				assert.equal(rootStatusAfterRemove, TreeStatus.Removed);
				const nodeStatusAfterRemove = node[treeStatus]();
				assert.equal(nodeStatusAfterRemove, TreeStatus.Removed);
			});
		});

		describe("EditableField", () => {
			it("root field and non-root field returns TreeStatus.InDocument", () => {
				const view = viewWithContent({
					schema: getTestSchema(FieldKinds.sequence),
					initialTree: { foo: ["foo"], foo2: [] },
				});

				const rootField = view.context.root;
				const rootFieldStatus = rootField.treeStatus();
				assert.equal(rootFieldStatus, TreeStatus.InDocument);

				const rootNode = view.root;
				assert(isEditableTree(rootNode));
				const field = rootNode[localFieldKey];
				assert(isEditableField(field));
				assert.equal(field.treeStatus(), TreeStatus.InDocument);
			});

			it("removed field and its contents returns TreeStatus.Removed", () => {
				const view = viewWithContent({
					schema: getTestSchema(FieldKinds.sequence),
					initialTree: { foo: ["foo"], foo2: [] },
				});
				const rootNode = view.root;
				assert(isEditableTree(rootNode));
				const field = rootNode[localFieldKey];
				assert(isEditableField(field));

				// Check TreeStatus before remove.
				const fieldStatusBeforeRemove = field.treeStatus();
				assert.equal(fieldStatusBeforeRemove, TreeStatus.InDocument);

				const node = field.getNode(0);
				const nodeStatusBeforeRemove = node[treeStatus]();
				assert.equal(nodeStatusBeforeRemove, TreeStatus.InDocument);

				const rootField = view.context.root;
				rootField.remove();

				// Check TreeStatus after remove.
				const fieldStatusAfterRemove = field.treeStatus();
				assert.equal(fieldStatusAfterRemove, TreeStatus.Removed);

				const nodeStatusAfterRemove = node[treeStatus]();
				assert.equal(nodeStatusAfterRemove, TreeStatus.Removed);
			});
		});
	});
});
