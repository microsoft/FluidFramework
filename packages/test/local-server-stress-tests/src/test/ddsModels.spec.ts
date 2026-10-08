/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { isChannelFactory } from "@fluid-private/test-dds-utils";
import { baseMapModel } from "@fluidframework/map/internal/test";

import { ddsModelMap, generateSubModelMap } from "./ddsModels.js";

describe("Local server DDS model aggregation", () => {
	it("registers fixed channel factories without changing their identity", () => {
		const factory = baseMapModel.factory;
		assert(isChannelFactory(factory));
		const models = generateSubModelMap(baseMapModel);
		assert.equal(models.size, 1);
		const model = models.get(factory.attributes.type);
		assert(model !== undefined);
		assert.equal(model.factory, factory);
		assert.equal(model.reducer, baseMapModel.reducer);
		assert.equal(model.validateConsistency, baseMapModel.validateConsistency);
	});

	it("registers the existing DDS models by channel type", () => {
		assert(ddsModelMap.size > 0);
		for (const [type, model] of ddsModelMap) {
			assert.equal(model.factory.attributes.type, type);
			assert.equal(typeof model.factory.create, "function");
			assert.equal(typeof model.factory.load, "function");
		}
	});

	it("rejects configurable factories instead of silently choosing a configuration", () => {
		assert.throws(
			() =>
				generateSubModelMap({
					...baseMapModel,
					factory: {
						generateClientConfiguration: () =>
							assert.fail("Aggregation must not generate a client configuration."),
						getFactory: () =>
							assert.fail("Aggregation must not resolve a client configuration."),
					},
				}),
			{
				name: "AssertionError",
				message: /Local server stress tests require DDS models with a fixed channel factory/,
			},
		);
	});
});
