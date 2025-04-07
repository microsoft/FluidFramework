/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { pkgVersion } from "../packageVersion.js";
import {
	DocumentsSchemaController,
	type IDocumentSchemaCurrent,
	type IDocumentSchemaFeatures,
} from "../summary/index.js";

function boolToProp(b: boolean) {
	return b ? true : undefined;
}

function arrayToProp(arr: string[]) {
	return arr.length === 0 ? undefined : arr;
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

	const features: IDocumentSchemaFeatures = {
		explicitSchemaControl: true,
		compressionLz4: true,
		opGroupingEnabled: false,
		idCompressorMode: "delayed",
		disallowedVersions: [],
	};

	function createController(config: unknown) {
		return new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			config as IDocumentSchemaCurrent, // old schema,
			features,
			() => {}, // onSchemaChange
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
				runtime: {
					explicitSchemaControl: boolToProp(featuresModified.explicitSchemaControl),
					compressionLz4: boolToProp(featuresModified.compressionLz4),
					idCompressorMode: featuresModified.idCompressorMode,
					opGroupingEnabled: boolToProp(featuresModified.opGroupingEnabled),
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
	});

	it("Existing document, changes required; race conditions", () => {
		const controller = new DocumentsSchemaController(
			true, // existing,
			0, // snapshotSequenceNumber
			validConfig, // old schema,
			{ ...features, opGroupingEnabled: true },
			() => {}, // onSchemaChange
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
});
