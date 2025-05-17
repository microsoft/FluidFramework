/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createMockLoggerExt,
	type IMockLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { defaultMinVersionForCollab } from "../compatUtils.js";
import { pkgVersion } from "../packageVersion.js";
import {
	DocumentsSchemaController,
	type IDocumentSchemaCurrent,
	type IDocumentSchemaFeatures,
} from "../summary/index.js";

function boolToProp(b: boolean | undefined) {
	return b ? true : undefined;
}

function arrayToProp(arr: string[]) {
	return arr.length === 0 ? undefined : arr;
}

describe("Runtime", () => {
	let logger: IMockLoggerExt;

	beforeEach(() => {
		logger = createMockLoggerExt();
	});
	const validConfig: IDocumentSchemaCurrent = {
		version: 1,
		refSeq: 0,
		info: { minVersionForCollab: defaultMinVersionForCollab },
		runtime: {
			// explicitSchemaControl: undefined,
			compressionLz4: true,
			idCompressorMode: "delayed",
			// opGroupingEnabled: undefined,
			// createBlobPayloadPending: true,
		},
	};

	const features = {
		explicitSchemaControl: true,
		compressionLz4: true,
		opGroupingEnabled: false,
		idCompressorMode: "delayed",
		createBlobPayloadPending: undefined,
		disallowedVersions: [],
	} as const satisfies IDocumentSchemaFeatures;

	function createController(config: unknown) {
		return new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			config as IDocumentSchemaCurrent, // old schema,
			features,
			() => {}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info,
			logger,
		);
	}

	function testWrongConfig(config: unknown) {
		assert.throws(() => {
			createController(config);
		}, "should throw on unknown property");

		const controller = createController(validConfig);
		assert.throws(() =>
			controller.processDocumentSchemaMessages(
				[config as IDocumentSchemaCurrent],
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

	it("disallowed versions", () => {
		const controller = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			validConfig, // old schema,
			{ ...features, disallowedVersions: [] },
			() => {}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info,
			logger,
		);

		assert(controller.sessionSchema.runtime.disallowedVersions === undefined);
		assert(controller.maybeSendSchemaMessage() === undefined);

		createController({
			...validConfig,
			runtime: { ...validConfig.runtime, disallowedVersions: ["aaa"] },
		});
		testWrongConfig({
			...validConfig,
			runtime: { ...validConfig.runtime, disallowedVersions: [pkgVersion] },
		});
		testWrongConfig({
			...validConfig,
			runtime: { ...validConfig.runtime, disallowedVersions: ["aaa", pkgVersion, "bbb"] },
		});
	});

	it("change disallowed versions", () => {
		const controller = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			// old schema
			{
				...validConfig,
				runtime: { ...validConfig.runtime, explicitSchemaControl: true },
			},
			// features requested
			{
				...features,
				disallowedVersions: ["aaa", "bbb"],
			},
			// onSchemaChange
			() => {},
			{ minVersionForCollab: defaultMinVersionForCollab }, // info,
			logger,
		);
		assert.deepEqual(controller.sessionSchema.runtime.disallowedVersions, ["aaa", "bbb"]);
		let message = controller.maybeSendSchemaMessage();
		assert(message !== undefined);
		controller.processDocumentSchemaMessages(
			[message],
			true /* local */,
			100 /* sequenceNumber */,
		);
		assert.deepEqual(controller.sessionSchema.runtime.disallowedVersions, ["aaa", "bbb"]);

		// Some runtime that drops one version, and adds another version to disallowed list
		const controller2 = new DocumentsSchemaController(
			true, // existing,
			300, // snapshotSequenceNumber
			// old schema
			controller.summarizeDocumentSchema(300),
			// features requested
			{
				...features,
				disallowedVersions: ["ccc", "aaa"],
			},
			// onSchemaChange
			() => {},
			{ minVersionForCollab: defaultMinVersionForCollab }, // info,
			logger,
		);
		assert.deepEqual(controller2.sessionSchema.runtime.disallowedVersions, [
			"aaa",
			"bbb",
			"ccc",
		]);
		message = controller2.maybeSendSchemaMessage();
		assert(message !== undefined);
		controller2.processDocumentSchemaMessages(
			[message],
			true /* local */,
			400 /* sequenceNumber */,
		);
		assert.deepEqual(controller2.sessionSchema.runtime.disallowedVersions, [
			"aaa",
			"bbb",
			"ccc",
		]);

		// Some runtime that only processes document schema op
		const controller3 = new DocumentsSchemaController(
			true, // existing,
			500, // snapshotSequenceNumber
			// old schema
			controller.summarizeDocumentSchema(500),
			features,
			// onSchemaChange
			() => {},
			{ minVersionForCollab: defaultMinVersionForCollab }, // info,
			logger,
		);
		controller3.processDocumentSchemaMessages(
			[message],
			true /* local */,
			600 /* sequenceNumber */,
		);
		assert.deepEqual(controller3.sessionSchema.runtime.disallowedVersions, [
			"aaa",
			"bbb",
			"ccc",
		]);
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
		const featuresModified = { ...features, explicitSchemaControl };
		const controller = new DocumentsSchemaController(
			existing, // existing,
			0, // snapshotSequenceNumber
			undefined, // old schema,
			featuresModified,
			() => assert(false, "no schema changes!"), // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info,
			logger,
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
			assert(controller.maybeSendSchemaMessage() === undefined, "no messages should be sent!");
		}

		// get rid of all properties with undefined values.
		const summarySchema = JSON.parse(
			JSON.stringify(controller.summarizeDocumentSchema(100 /* refSeq */)),
		) as IDocumentSchemaCurrent;
		if (!explicitSchemaControl) {
			assert.deepEqual(summarySchema, validConfig, "summarized schema as expected");
		} else if (existing) {
			const expected = {
				version: 1,
				refSeq: 0,
				info: { minVersionForCollab: defaultMinVersionForCollab },
				runtime: {
					// Existing files without any schema are considered to be in legacy mode.
					explicitSchemaControl: undefined,
				},
			};
			assert.deepEqual(
				summarySchema,
				JSON.parse(JSON.stringify(expected)),
				"summarized schema as expected",
			);
		} else {
			const expected = {
				version: 1,
				refSeq: 0,
				info: { minVersionForCollab: defaultMinVersionForCollab },
				runtime: {
					explicitSchemaControl: boolToProp(featuresModified.explicitSchemaControl),
					compressionLz4: boolToProp(featuresModified.compressionLz4),
					idCompressorMode: featuresModified.idCompressorMode,
					opGroupingEnabled: boolToProp(featuresModified.opGroupingEnabled),
					createBlobPayloadPending: featuresModified.createBlobPayloadPending,
					disallowedVersions: arrayToProp(featuresModified.disallowedVersions),
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
			controller.processDocumentSchemaMessages(
				[validConfig],
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
			true, // existing,
			0, // snapshotSequenceNumber
			schema, // old schema,
			features,
			() => {}, // onSchemaChange
			schema.info, // info,
			logger,
		);

		controller.onDisconnect();
		assert(controller.maybeSendSchemaMessage() === undefined, "no messages should be sent!");
	}

	it("Existing document with existing schema, no changes", () => {
		testExistingDocNoChangesInSchema(validConfig);
		testExistingDocNoChangesInSchema({
			...validConfig,
			runtime: { ...validConfig.runtime, explicitSchemaControl: true },
		});
		testExistingDocNoChangesInSchema({
			...validConfig,
			// Should not change schema since it is lower than the existing minVersionForCollab
			info: { minVersionForCollab: "1.0.0" },
		});
	});

	it("Existing document with existing schema, change to minVersionForCollab", () => {
		const controller = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			validConfig, // old schema,
			features, // features
			() => {}, // onSchemaChange
			{ minVersionForCollab: "2.20.0" }, // info
			logger,
		);
		const message = controller.maybeSendSchemaMessage();
		assert(message !== undefined);
		assert.strictEqual(message.info.minVersionForCollab, "2.20.0");
		assert(
			controller.processDocumentSchemaMessages(
				[message],
				true, // local
				200,
			) === true,
		);
		const schema = controller.summarizeDocumentSchema(300);
		assert(schema !== undefined);
		assert.strictEqual(schema.info.minVersionForCollab, "2.20.0");
	});

	it("Existing document with existing schema, multiple changes to minVersionForCollab", () => {
		// minVersionForCollab = 2.20.0 (schema change)
		const controller1 = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			validConfig, // old schema,
			features, // features
			() => {}, // onSchemaChange
			{ minVersionForCollab: "2.20.0" }, // info
			logger,
		);
		const message1 = controller1.maybeSendSchemaMessage();
		assert(message1 !== undefined);
		assert(
			controller1.processDocumentSchemaMessages(
				[message1],
				true, // local
				200,
			) === true,
		);
		const schema1 = controller1.summarizeDocumentSchema(300);
		assert(schema1 !== undefined);
		assert.strictEqual(schema1.info.minVersionForCollab, "2.20.0");

		// minVersionForCollab = 2.0.0 (no schema change)
		const controller2 = new DocumentsSchemaController(
			true, // existing,
			300, // snapshotSequenceNumber
			schema1, // old schema,
			features, // features
			() => {}, // onSchemaChange
			{ minVersionForCollab: "2.0.0" }, // info
			logger,
		);
		const message2 = controller2.maybeSendSchemaMessage();
		// Should be undefined since there is no update to the schema
		assert(message2 === undefined);
		const schema2 = controller2.summarizeDocumentSchema(600);
		assert(schema2 !== undefined);
		assert.strictEqual(schema2.info.minVersionForCollab, "2.20.0");

		// minVersionForCollab = 2.30.0 (schema change)
		const controller3 = new DocumentsSchemaController(
			true, // existing,
			600, // snapshotSequenceNumber
			schema2, // old schema,
			features, // featur
			() => {}, // onSchemaChange
			{ minVersionForCollab: "2.30.0" }, // info
			logger,
		);
		const message3 = controller3.maybeSendSchemaMessage();
		assert(message3 !== undefined);
		assert(
			controller3.processDocumentSchemaMessages(
				[message3],
				true, // local
				800,
			) === true,
		);
		const schema3 = controller3.summarizeDocumentSchema(300);
		assert(schema3 !== undefined);
		assert.strictEqual(schema3.info.minVersionForCollab, "2.30.0");
	});

	it("Existing document, changes required; race conditions", () => {
		const controller = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			validConfig, // old schema,
			{ ...features, opGroupingEnabled: true },
			() => {}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);

		const message = controller.maybeSendSchemaMessage();

		assert(message !== undefined);
		assert(message.runtime.opGroupingEnabled === true);

		// Validate that client will attempt to send only one such message.
		// This is important, as otherwise we will keep sending them forever. Not only this is useless,
		// but it will also trip asserts as we will have two messages with same sequence number (due to op grouping)
		assert(controller.maybeSendSchemaMessage() === undefined);

		assert(
			controller.processDocumentSchemaMessages(
				[message],
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
			true, // existing,
			300, // snapshotSequenceNumber
			schema, // old schema,
			{ ...features, idCompressorMode: undefined, compressionLz4: false },
			() => {}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);

		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access -- Accessing private property
		assert.deepEqual((controller2 as any).documentSchema, schema);

		// updates with old refSeq should fail silently.
		assert(
			controller.processDocumentSchemaMessages(
				[{ ...message, refSeq: 100 }],
				false, // local
				201,
			) === false,
		);

		// new change with some future sequence number should never happen, thus code should throw.
		assert.throws(() => {
			assert(message !== undefined);
			controller.processDocumentSchemaMessages(
				[{ ...message, refSeq: 300 }],
				false, // local
				202,
			);
		});

		// new change in schema with updated ref seq should be allowed
		assert(
			controller.processDocumentSchemaMessages(
				[{ ...message, refSeq: 200 }],
				false, // local
				305,
			) === true,
		);

		// Sequence numbers should move only forward.
		assert.throws(() => {
			assert(message !== undefined);
			controller.processDocumentSchemaMessages(
				[{ ...message, refSeq: 305 }],
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
			true, // existing,
			0, // snapshotSequenceNumber
			undefined, // old schema,
			{ ...features, idCompressorMode: undefined, compressionLz4: false },
			() => {
				assert(false, "no changes!");
			}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);

		assert(controller.maybeSendSchemaMessage() === undefined);

		/**
		 * validate that we can summarize, load new client from that summary and it also will not send any ops
		 */
		const newSchema = controller.summarizeDocumentSchema(100);
		const controller2 = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			newSchema, // old schema,
			{ ...features, idCompressorMode: undefined, compressionLz4: false },
			() => {
				assert(false, "no changes!");
			}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);

		assert(controller2.maybeSendSchemaMessage() === undefined);

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
			true, // existing,
			0, // snapshotSequenceNumber
			newSchema, // old schema,
			{ ...features, idCompressorMode: "on", compressionLz4: false },
			() => {
				schemaChanged = true;
			}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);

		// setting is not on yet
		assert(controller3.sessionSchema.runtime.idCompressorMode === undefined);

		const message = controller3.maybeSendSchemaMessage();
		assert(message !== undefined, "message sent");
		assert(message.runtime.idCompressorMode === "on");

		controller3.processDocumentSchemaMessages(
			[message],
			true, // local
			100,
		); // sequenceNumber
		assert(schemaChanged, "schema changed");
		assert(controller3.sessionSchema.runtime.idCompressorMode === "on");
		const schema = controller3.summarizeDocumentSchema(200) as IDocumentSchemaCurrent;
		assert(schema.runtime.idCompressorMode === "on", "now on");

		assert(controller3.maybeSendSchemaMessage() === undefined);

		/**
		 * Validate now that another client that was observing schema changes (not initiating them) will arrive to same state
		 * This client will want to flip groupedBatching, but it will process someone else op first...
		 */
		schemaChanged = false;
		const controller4 = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			newSchema, // old schema,
			{
				...features,
				idCompressorMode: undefined,
				compressionLz4: false,
				opGroupingEnabled: true,
			},
			() => (schemaChanged = true), // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);
		controller4.processDocumentSchemaMessages(
			[message],
			false, // local
			200,
		); // sequenceNumber
		assert(schemaChanged, "schema changed");
		assert(controller4.sessionSchema.runtime.idCompressorMode === "on");
		assert(
			controller4.maybeSendSchemaMessage() === undefined,
			"no messages should be sent - it lost a race and will not attempt to change file format.",
		);

		// Validate same summaries by two clients.
		const schema2 = controller3.summarizeDocumentSchema(200) as IDocumentSchemaCurrent;
		assert.deepEqual(schema, schema2, "same summaries");
	});

	it("does not send telemetry warning if minVersionForCollab is less than or equal to pkgVersion", () => {
		// Document's minVersionForCollab is less than pkgVersion
		const documentMinVersionForCollab = "2.0.0";
		new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			{ ...validConfig, info: { minVersionForCollab: documentMinVersionForCollab } }, // old schema,
			features, // features
			() => {}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);
		const event = logger.events().find((e) => e.eventName === "MinVersionForCollabWarning");
		assert.strictEqual(event, undefined, "telemetry warning event should not be logged");

		// Document's minVersionForCollab is equal to pkgVersion
		new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			{ ...validConfig, info: { minVersionForCollab: pkgVersion } }, // old schema,
			features, // features
			() => {}, // onSchemaChange
			{ minVersionForCollab: defaultMinVersionForCollab }, // info
			logger,
		);
		const event2 = logger.events().find((e) => e.eventName === "MinVersionForCollabWarning");
		assert.strictEqual(event2, undefined, "telemetry warning event should not be logged");
	});

	it("properly sends telemetry warning if minVersionForCollab is greater than pkgVersion", () => {
		const documentMinVersionForCollab = "100.0.0";
		new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			{ ...validConfig, info: { minVersionForCollab: documentMinVersionForCollab } }, // old schema,
			features, // features
			() => {}, // onSchemaChange
			{ minVersionForCollab: documentMinVersionForCollab }, // info
			logger,
		);
		const expectedEvent = {
			category: "generic",
			eventName: "MinVersionForCollabWarning",
			message: `WARNING: The version of Fluid Framework used by this client (${pkgVersion}) is not supported by this document! Please upgrade to version ${documentMinVersionForCollab} or later to ensure compatibility.`,
		};
		const event = logger.events().find((e) => e.eventName === "MinVersionForCollabWarning");
		assert.deepStrictEqual(event, expectedEvent, "telemetry warning event should be logged");
	});
});
