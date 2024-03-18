/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { DocumentsSchemaController, type IDocumentSchemaCurrent } from "../summary/index.js";

function boolToProp(b: boolean) {
	return b ? true : undefined;
}

describe("Runtime", () => {
	const validConfig: IDocumentSchemaCurrent = {
		version: "1.0",
		refSeq: 0,
		runtime: {
			// newBehavior: undefined,
			compressionLz4: true,
			idCompressorMode: "delayed",
			// opGroupingEnabled: undefined,
		},
	};

	function createController(config: unknown) {
		new DocumentsSchemaController(
			true, // newBehavior
			false, // existing,
			config as IDocumentSchemaCurrent, // old schema,
			true, // lz4
			"delayed", // idCompressionMode
			false, // groupedBatching,
			() => {}, // onSchemaChange
		);
	}

	function testWrongConfig(config: unknown) {
		assert.throws(() => {
			createController(config);
		}, "should throw on unknown property");
	}

	// Validate first that config is indeed valid, such that all further tests are not tripping
	// on something else that they are not modifying.
	it("valid config", () => {
		createController(validConfig);
	});

	// It's hard to say if we will allow additional propeorty trees here like this sample shows.
	// More likely that will require version bump, to ensure that old code does not run with such structure.
	// If if such configs will be backward compatible (similar to runtime options we are listing that were in use for very long time),
	// then maybe ability to add them in such back-compat way is a plus
	it("extra global property ois Ok", () => {
		createController({ ...validConfig, appProperty: { foo: 5 } });
	});

	it("empty object", () => {
		testWrongConfig({});
	});

	it("wrong version", () => {
		testWrongConfig({ ...validConfig, version: "4.0" });
	});

	it("wrong refSeq", () => {
		testWrongConfig({ ...validConfig, refSeq: "aaa" });
	});

	it("no refSeq", () => {
		testWrongConfig({ ...validConfig, refSeq: undefined });
	});

	it("no runtime", () => {
		testWrongConfig({ ...validConfig, runtime: undefined });
	});

	it("unknown runtime property", () => {
		testWrongConfig({ ...validConfig, runtime: { ...validConfig.runtime, foo: 5 } });
	});

	it("wrong values for known properties", () => {
		testWrongConfig({
			...validConfig,
			runtime: { ...validConfig.runtime, idCompressorMode: 5 },
		});
		testWrongConfig({
			...validConfig,
			runtime: { ...validConfig.runtime, idCompressorMode: "foo" },
		});
		testWrongConfig({
			...validConfig,
			runtime: { ...validConfig.runtime, opGroupingEnabled: false },
		});
		testWrongConfig({
			...validConfig,
			runtime: { ...validConfig.runtime, opGroupingEnabled: "aa" },
		});
	});

	function testSimpleCases(newBehavior: boolean, existing: boolean) {
		const controller = new DocumentsSchemaController(
			newBehavior,
			existing, // existing,
			undefined, // old schema,
			true, // lz4
			"delayed", // idCompressionMode
			false, // groupedBatching,
			() => assert(false, "no schema changes!"), // onSchemaChange
		);

		assert(controller.sessionSchema.refSeq === 0, "refSeq");
		assert(controller.sessionSchema.version === "1.0", "version");
		assert(
			controller.sessionSchema.runtime.newBehavior === boolToProp(newBehavior),
			"newBehavior",
		);

		if (existing && newBehavior) {
			assert(controller.sessionSchema.runtime.compressionLz4 === undefined, "lz4");
			assert(
				controller.sessionSchema.runtime.idCompressorMode === undefined,
				"idCompressorMode",
			);
		} else {
			assert(controller.sessionSchema.runtime.compressionLz4 === true, "lz4");
			assert(
				controller.sessionSchema.runtime.idCompressorMode === "delayed",
				"idCompressorMode",
			);
		}
		assert(
			controller.sessionSchema.runtime.opGroupingEnabled === undefined,
			"opGroupingEnabled",
		);

		if (!existing || !newBehavior) {
			controller.onDisconnect();
			controller.onMessageSent(() => {
				assert(false, "no messages should be sent!");
			});
		}

		// get rid of all properties with undefined values.
		const summarySchema = JSON.parse(
			JSON.stringify(controller.summarizeDocumentSchema(100 /* refSeq */)),
		);
		if (!newBehavior) {
			assert.deepEqual(summarySchema, validConfig, "summarized schema as expected");
		} else {
			const expected = {
				version: "1.0",
				refSeq: 0,
				runtime: {
					// Existing files without any schema are considered to be in legacy mode.
					newBehavior: boolToProp(!existing),
				},
			};
			assert.deepEqual(
				summarySchema,
				JSON.parse(JSON.stringify(expected)),
				"summarized schema as expected",
			);
		}

		// No local messages are expected
		assert.throws(() => controller.processDocumentSchemaOp(validConfig, true /* local */));
	}

	it("Creation of new document", () => {
		testSimpleCases(
			true, // newBehavior
			false, // existing
		);
		testSimpleCases(
			false, // newBehavior
			false, // existing
		);
	});

	it("Existing document, no schema", () => {
		testSimpleCases(
			true, // newBehavior
			true, // existing
		);
		testSimpleCases(
			false, // newBehavior
			true, // existing
		);
	});

	function testExistingDocNoChangesInSchema(schema: IDocumentSchemaCurrent) {
		const controller = new DocumentsSchemaController(
			true, // newBehavior
			true, // existing,
			schema, // old schema,
			true, // lz4
			"delayed", // idCompressionMode
			false, // groupedBatching,
			() => {}, // onSchemaChange
		);

		controller.onDisconnect();
		controller.onMessageSent(() => {
			assert(false, "no messages should be sent!");
		});
	}

	it("Existing document with existing schema, no changes", () => {
		testExistingDocNoChangesInSchema(validConfig);
		testExistingDocNoChangesInSchema({
			...validConfig,
			runtime: { ...validConfig.runtime, newBehavior: true },
		});
	});

	it("Existing document with existing schema, changes required", () => {
		// TBD
	});

	it("changing schema and races", () => {
		// TBD
	});
});
