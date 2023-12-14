import { strict as assert } from "assert";
import {
	DefaultEditBuilder,
	ModularChangeFamily,
	ModularChangeset,
	cursorForJsonableTreeNode,
	fieldKinds,
} from "../../feature-libraries";
import { typeboxValidator } from "../../external-utilities";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeChangeFamily } from "../../shared-tree/sharedTreeChangeFamily";
import {
	TreeStoredSchema,
	makeAnonChange,
	revisionMetadataSourceFromInfo,
	rootFieldKey,
} from "../../core";
import { leaf } from "../../domains";
// eslint-disable-next-line import/no-internal-modules
import { SharedTreeChange } from "../../shared-tree/sharedTreeChangeTypes";
// eslint-disable-next-line import/no-internal-modules
import { forbidden } from "../../feature-libraries/default-schema/defaultFieldKinds";

const dataChanges: ModularChangeset[] = [];
const modularFamily = new ModularChangeFamily(fieldKinds, { jsonValidator: typeboxValidator });
const defaultEditor = new DefaultEditBuilder(modularFamily, (change) => dataChanges.push(change));

const nodeX = { type: leaf.string.name, value: "X" };
const nodeY = { type: leaf.string.name, value: "Y" };

// Side effects results in `dataChanges` being populated
defaultEditor
	.valueField({ parent: undefined, field: rootFieldKey })
	.set(cursorForJsonableTreeNode(nodeX));
defaultEditor
	.valueField({ parent: undefined, field: rootFieldKey })
	.set(cursorForJsonableTreeNode(nodeY));

const dataChange1 = dataChanges[0];
const dataChange2 = dataChanges[1];
const stDataChange1: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChange1 }],
};
const stDataChange2: SharedTreeChange = {
	changes: [{ type: "data", innerChange: dataChange2 }],
};
const emptySchema: TreeStoredSchema = {
	nodeSchema: new Map(),
	rootFieldSchema: {
		kind: forbidden,
	},
};
const stSchemaChange: SharedTreeChange = {
	changes: [{ type: "schema", innerChange: { schema: { new: emptySchema, old: emptySchema } } }],
};
const stEmptyChange: SharedTreeChange = {
	changes: [],
};

const sharedTreeFamily = new SharedTreeChangeFamily({ jsonValidator: typeboxValidator });

describe("SharedTreeChangeFamily", () => {
	it("composition composes runs of data changes", () => {
		assert.deepEqual(
			sharedTreeFamily.compose([
				makeAnonChange(stDataChange1),
				makeAnonChange(stDataChange2),
				makeAnonChange(stSchemaChange),
				makeAnonChange(stDataChange1),
				makeAnonChange(stDataChange2),
				makeAnonChange(stDataChange2),
			]),
			{
				changes: [
					{
						type: "data",
						innerChange: modularFamily.compose([
							makeAnonChange(dataChange1),
							makeAnonChange(dataChange2),
						]),
					},
					stSchemaChange.changes[0],
					{
						type: "data",
						innerChange: modularFamily.compose([
							makeAnonChange(dataChange1),
							makeAnonChange(dataChange2),
							makeAnonChange(dataChange2),
						]),
					},
				],
			},
		);
	});

	it("empty changes result in no-op rebases", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				stSchemaChange,
				makeAnonChange(stEmptyChange),
				revisionMetadataSourceFromInfo([]),
			),
			stSchemaChange,
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				stDataChange1,
				makeAnonChange(stEmptyChange),
				revisionMetadataSourceFromInfo([]),
			),
			stDataChange1,
		);
	});

	it("schema edits cause all concurrent changes to conflict", () => {
		assert.deepEqual(
			sharedTreeFamily.rebase(
				stSchemaChange,
				makeAnonChange(stDataChange1),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				stDataChange1,
				makeAnonChange(stSchemaChange),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);

		assert.deepEqual(
			sharedTreeFamily.rebase(
				stSchemaChange,
				makeAnonChange(stSchemaChange),
				revisionMetadataSourceFromInfo([]),
			),
			{
				changes: [],
			},
		);
	});

	describe("without schema edits should behave identically to ModularChangeFamily", () => {
		it("when composing", () => {
			assert.deepEqual(
				sharedTreeFamily.compose([
					makeAnonChange(stDataChange1),
					makeAnonChange(stDataChange2),
				]),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.compose([
								makeAnonChange(dataChange1),
								makeAnonChange(dataChange2),
							]),
						},
					],
				},
			);
		});

		it("when rebasing", () => {
			assert.deepEqual(
				sharedTreeFamily.rebase(
					stDataChange1,
					makeAnonChange(stDataChange2),
					revisionMetadataSourceFromInfo([]),
				),
				{
					changes: [
						{
							type: "data",
							innerChange: modularFamily.rebase(
								dataChange1,
								makeAnonChange(dataChange2),
								revisionMetadataSourceFromInfo([]),
							),
						},
					],
				},
			);
		});

		for (const isRollback of [true, false]) {
			it(`when inverting (isRollback = ${isRollback})`, () => {
				assert.deepEqual(
					sharedTreeFamily.invert(makeAnonChange(stDataChange1), isRollback),
					{
						changes: [
							{
								type: "data",
								innerChange: modularFamily.invert(
									makeAnonChange(dataChange1),
									isRollback,
								),
							},
						],
					},
				);
			});
		}
	});
});
