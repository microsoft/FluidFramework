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
		version: 1,
		refSeq: 0,
		runtime: {
			// explicitSchemaControl: undefined,
			compressionLz4: true,
			idCompressorMode: "delayed",
			// opGroupingEnabled: undefined,
		},
	};

	function createController(config: unknown) {
		return new DocumentsSchemaController(
			true, // explicitSchemaControl
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

		const controller = createController(validConfig);
		assert.throws(() =>
			controller.processDocumentSchemaOp(
				config as IDocumentSchemaCurrent,
				false, // local
				100,
			),
		); // sequenceNumber
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
		testWrongConfig({ ...validConfig, version: 4 });
		testWrongConfig({ ...validConfig, version: "1" });
		testWrongConfig({ ...validConfig, version: "2.0" });
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

	function testSimpleCases(explicitSchemaControl: boolean, existing: boolean) {
		const controller = new DocumentsSchemaController(
			explicitSchemaControl,
			existing, // existing,
			undefined, // old schema,
			true, // lz4
			"delayed", // idCompressionMode
			false, // groupedBatching,
			() => assert(false, "no schema changes!"), // onSchemaChange
		);

		assert(controller.sessionSchema.refSeq === 0, "refSeq");
		assert(controller.sessionSchema.version === 1, "version");
		assert(
			controller.sessionSchema.runtime.explicitSchemaControl ===
				boolToProp(explicitSchemaControl),
			"explicitSchemaControl",
		);

		if (existing && explicitSchemaControl) {
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

		if (!existing || !explicitSchemaControl) {
			controller.onDisconnect();
			controller.onMessageSent(() => {
				assert(false, "no messages should be sent!");
			});
		}

		// get rid of all properties with undefined values.
		const summarySchema = JSON.parse(
			JSON.stringify(controller.summarizeDocumentSchema(100 /* refSeq */)),
		);
		if (!explicitSchemaControl) {
			assert.deepEqual(summarySchema, validConfig, "summarized schema as expected");
		} else {
			const expected = {
				version: 1,
				refSeq: 0,
				runtime: {
					// Existing files without any schema are considered to be in legacy mode.
					explicitSchemaControl: boolToProp(!existing),
				},
			};
			assert.deepEqual(
				summarySchema,
				JSON.parse(JSON.stringify(expected)),
				"summarized schema as expected",
			);
		}

		// No local messages are expected
		assert.throws(() =>
			controller.processDocumentSchemaOp(
				validConfig,
				true, // local
				100,
			),
		); // sequenceNumber
	}

	it("Creation of new document", () => {
		testSimpleCases(
			true, // explicitSchemaControl
			false, // existing
		);
		testSimpleCases(
			false, // explicitSchemaControl
			false, // existing
		);
	});

	it("Existing document, no schema", () => {
		testSimpleCases(
			true, // explicitSchemaControl
			true, // existing
		);
		testSimpleCases(
			false, // explicitSchemaControl
			true, // existing
		);
	});

	function testExistingDocNoChangesInSchema(schema: IDocumentSchemaCurrent) {
		const controller = new DocumentsSchemaController(
			true, // explicitSchemaControl
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
			runtime: { ...validConfig.runtime, explicitSchemaControl: true },
		});
	});

	it("Existing document, changes required; race conditions", () => {
		const controller = new DocumentsSchemaController(
			true, // explicitSchemaControl
			true, // existing,
			validConfig, // old schema,
			true, // lz4
			"delayed", // idCompressionMode
			true, // groupedBatching,
			() => {}, // onSchemaChange
		);

		let message: IDocumentSchemaCurrent | undefined;
		controller.onMessageSent((msg) => {
			message = msg as IDocumentSchemaCurrent;
		});

		assert(message !== undefined);
		assert(message.runtime.opGroupingEnabled === true);

		assert(
			controller.processDocumentSchemaOp(
				message,
				true, // local
				200,
			) === true,
		);

		assert(controller.sessionSchema.runtime.opGroupingEnabled === true);
		assert(controller.sessionSchema.refSeq === 200);

		const schema = controller.summarizeDocumentSchema(300);
		assert(schema !== undefined);
		assert(schema.refSeq === 200);

		const controller2 = new DocumentsSchemaController(
			true, // explicitSchemaControl
			true, // existing,
			schema, // old schema,
			false, // lz4
			undefined, // idCompressionMode
			false, // groupedBatching,
			() => {}, // onSchemaChange
		);

		assert.deepEqual((controller2 as any).documentSchema, schema);

		// updates with old refSeq should fail silently.
		assert(
			controller.processDocumentSchemaOp(
				{ ...message, refSeq: 100 },
				false, // local
				201,
			) === false,
		);

		// new change with some future sequence number should never happen, thus code should throw.
		assert.throws(() => {
			assert(message !== undefined);
			controller.processDocumentSchemaOp(
				{ ...message, refSeq: 300 },
				false, // local
				202,
			);
		});

		// new change in schema with updated ref seq should be allowed
		assert(
			controller.processDocumentSchemaOp(
				{ ...message, refSeq: 200 },
				false, // local
				305,
			) === true,
		);

		// Sequence numbers should move only forward.
		assert.throws(() => {
			assert(message !== undefined);
			controller.processDocumentSchemaOp(
				{ ...message, refSeq: 305 },
				false, // local
				300,
			);
		});
	});

	it("AzureClient modes", () => {
		/**
		 * Start with no schema in a document.
		 * There should be no ops sent.
		 */
		const controller = new DocumentsSchemaController(
			true, // explicitSchemaControl
			true, // existing,
			undefined, // old schema,
			false, // lz4
			undefined, // idCompressionMode
			false, // groupedBatching,
			() => {
				assert(false, "no changes!");
			}, // onSchemaChange
		);

		controller.onMessageSent(() => {
			assert(false, "no messages should be sent!");
		});

		/**
		 * validate that we can summarize, load new client from that summary and it also will not send any ops
		 */
		const newSchema = controller.summarizeDocumentSchema(100);
		const controller2 = new DocumentsSchemaController(
			true, // explicitSchemaControl
			true, // existing,
			newSchema, // old schema,
			false, // lz4
			undefined, // idCompressionMode
			false, // groupedBatching,
			() => {
				assert(false, "no changes!");
			}, // onSchemaChange
		);

		controller2.onMessageSent(() => {
			assert(false, "no messages should be sent!");
		});

		/**
		 * Summarize from that new client and ensure we are getting exactly same summary, thus getting to same state.
		 */
		const newSchema2 = controller.summarizeDocumentSchema(100);
		assert.deepEqual(newSchema, newSchema2, "got into stable state");

		/**
		 * Now let's see if we can change schema.
		 */
		let schemaChanged = false;
		const controller3 = new DocumentsSchemaController(
			true, // explicitSchemaControl
			true, // existing,
			newSchema, // old schema,
			false, // lz4
			"on", // idCompressionMode
			false, // groupedBatching,
			() => {
				schemaChanged = true;
			}, // onSchemaChange
		);

		// setting is not on yet
		assert(controller3.sessionSchema.runtime.idCompressorMode === undefined);

		let message: IDocumentSchemaCurrent | undefined;
		controller3.onMessageSent((msg) => {
			message = msg as IDocumentSchemaCurrent;
			assert(message.runtime.idCompressorMode === "on");
		});
		assert(message !== undefined, "message sent");

		controller3.processDocumentSchemaOp(
			message,
			true, // local
			100,
		); // sequenceNumber
		assert(schemaChanged, "schema changed");
		assert(controller3.sessionSchema.runtime.idCompressorMode === "on");
		const schema = controller3.summarizeDocumentSchema(200) as IDocumentSchemaCurrent;
		assert(schema.runtime.idCompressorMode === "on", "now on");

		controller3.onMessageSent(() => {
			assert(false, "no more messages to send");
		});

		/**
		 * Validate now that another client that was observing schema changes (not initiating them) will arrive to same state
		 * This client will want to flip groupedBatching, but it will process someone else op first...
		 */
		schemaChanged = false;
		const controller4 = new DocumentsSchemaController(
			true, // explicitSchemaControl
			true, // existing,
			newSchema, // old schema,
			false, // lz4
			undefined, // idCompressionMode
			true, // groupedBatching,
			() => (schemaChanged = true), // onSchemaChange
		);
		controller4.processDocumentSchemaOp(
			message,
			false, // local
			200,
		); // sequenceNumber
		assert(schemaChanged, "schema changed");
		assert(controller4.sessionSchema.runtime.idCompressorMode === "on");
		controller4.onMessageSent(() => {
			assert(
				false,
				"no messages should be sent - it lost a race and will not attempt to change file format.",
			);
		});

		// Validate same summaries by two clients.
		const schema2 = controller3.summarizeDocumentSchema(200) as IDocumentSchemaCurrent;
		assert.deepEqual(schema, schema2, "same summaries");
	});
});
