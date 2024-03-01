/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { UsageError } from "@fluidframework/telemetry-utils";
import {
	FieldKinds,
	FlexFieldSchema,
	SchemaBuilderBase,
	createMockNodeKeyManager,
	intoStoredSchema,
	nodeKeyFieldKey,
} from "../../feature-libraries/index.js";

import {
	SchematizeError,
	SchematizingSimpleTreeView,
	// eslint-disable-next-line import/no-internal-modules
} from "../../shared-tree/schematizingTreeView.js";
import { SchemaFactory, TreeConfiguration, toFlexConfig } from "../../simple-tree/index.js";
import { brand, disposeSymbol } from "../../util/index.js";
import { checkoutWithContent } from "../utils.js";
// eslint-disable-next-line import/no-internal-modules
import { required } from "../../feature-libraries/default-schema/defaultFieldKinds.js";
import { leaf } from "../../domains/index.js";
// eslint-disable-next-line import/no-internal-modules
import { UpdateType } from "../../shared-tree/schematizeTree.js";
// eslint-disable-next-line import/no-internal-modules
import { toFlexSchema } from "../../simple-tree/toFlexSchema.js";

const schema = new SchemaFactory("com.example");
const config = new TreeConfiguration(schema.number, () => 5);
const configGeneralized = new TreeConfiguration([schema.number, schema.string], () => 6);
const flexConfig = toFlexConfig(config);
const flexConfigGeneralized = toFlexConfig(configGeneralized);

// Schema for tree that must always be empty.
const emptySchema = new SchemaBuilderBase(FieldKinds.required, {
	scope: "Empty",
	lint: {
		rejectEmpty: false,
		rejectForbidden: false,
	},
}).intoSchema(FlexFieldSchema.empty);

describe("SchematizingSimpleTreeView", () => {
	it("Initialize document", () => {
		const emptyContent = {
			schema: emptySchema,
			initialTree: undefined,
		};
		const checkout = checkoutWithContent(emptyContent);
		const view = new SchematizingSimpleTreeView(
			checkout,
			config,
			createMockNodeKeyManager(),
			brand(nodeKeyFieldKey),
		);

		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert(error.canInitialize === true);
		assert(error.canUpgrade === true);
		assert(error.updateType === UpdateType.Initialize);

		view.upgradeSchema();
		assert.equal(view.root, 5);
	});

	it("Open and close existing document", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(
			checkout,
			config,
			createMockNodeKeyManager(),
			brand(nodeKeyFieldKey),
		);
		assert.equal(view.error, undefined);
		const root = view.root;
		assert.equal(root, 5);
		const log: [string, unknown][] = [];
		const unsubscribe = view.events.on("rootChanged", () =>
			log.push(["rootChanged", view.error ?? view.root]),
		);
		const unsubscribe2 = view.events.on("afterBatch", () =>
			log.push(["afterBatch", view.root]),
		);

		// Should be a no op since not in an error state;
		view.upgradeSchema();

		view[disposeSymbol]();
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		unsubscribe();
		unsubscribe2();

		assert.deepEqual(log, []);
	});

	it("Modify root", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(
			checkout,
			config,
			createMockNodeKeyManager(),
			brand(nodeKeyFieldKey),
		);
		view.events.on("rootChanged", () => log.push(["rootChanged", view.error ?? view.root]));
		view.events.on("afterBatch", () => log.push(["afterBatch", view.root]));
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];

		// Currently there is no way to edit the root using the simple-tree API, so use flex-tree to do it:
		const flexView = view.getViewOrError();
		assert(!(flexView instanceof SchematizeError));
		assert(flexView.flexTree.is(FlexFieldSchema.create(required, [leaf.number])));
		flexView.flexTree.content = 6;

		assert.deepEqual(log, [
			["rootChanged", 6],
			// This checkout editing setup does not produce batch events.
			// ["afterBatch", 6],
		]);
	});

	it("Schema becomes incompatible then comparable", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(
			checkout,
			config,
			createMockNodeKeyManager(),
			brand(nodeKeyFieldKey),
		);
		assert.equal(view.root, 5);
		const log: [string, unknown][] = [];
		view.events.on("rootChanged", () => log.push(["rootChanged", view.error ?? view.root]));

		// Modify schema to invalidate view
		checkout.updateSchema(intoStoredSchema(toFlexSchema([schema.number, schema.string])));

		// typecast is needed here to remove narrowing from previous assert.
		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert.deepEqual(log, [["rootChanged", error]]);
		log.length = 0;
		assert(error.canInitialize === false);
		assert(error.canUpgrade === false);
		assert(error.updateType === UpdateType.Incompatible);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		assert.throws(
			() => view.upgradeSchema(),
			(e) => e instanceof UsageError,
		);

		// Modify schema to be compatible again
		checkout.updateSchema(intoStoredSchema(toFlexSchema([schema.number])));
		assert.deepEqual(log, [["rootChanged", 5]]);
		assert.equal(view.root, 5);
		view[disposeSymbol]();
	});

	it("Open upgradable document, then upgrade schema", () => {
		const checkout = checkoutWithContent(flexConfig);
		const view = new SchematizingSimpleTreeView(
			checkout,
			configGeneralized,
			createMockNodeKeyManager(),
			brand(nodeKeyFieldKey),
		);
		const log: [string, unknown][] = [];
		view.events.on("rootChanged", () => log.push(["rootChanged", view.error ?? view.root]));

		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert(error.canInitialize === false);
		assert(error.canUpgrade === true);
		assert(error.updateType === UpdateType.SchemaCompatible);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		view.upgradeSchema();

		assert.deepEqual(log, [["rootChanged", 5]]);

		assert.equal(view.error, undefined);
		assert.equal(view.root, 5);
	});

	it("Open incompatible document", () => {
		const checkout = checkoutWithContent(flexConfigGeneralized);
		const view = new SchematizingSimpleTreeView(
			checkout,
			config,
			createMockNodeKeyManager(),
			brand(nodeKeyFieldKey),
		);

		const error: SchematizeError | undefined = view.error;
		assert(error instanceof SchematizeError);
		assert(error.canInitialize === false);
		assert(error.canUpgrade === false);
		assert(error.updateType === UpdateType.Incompatible);
		assert.throws(
			() => view.root,
			(e) => e instanceof UsageError,
		);

		assert.throws(
			() => view.upgradeSchema(),
			(e) => e instanceof UsageError,
		);
	});
});
