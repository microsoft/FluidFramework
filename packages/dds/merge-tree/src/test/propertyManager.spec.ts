/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UnassignedSequenceNumber } from "../constants.js";
import type { ISegmentLeaf } from "../mergeTreeNodes.js";
import { matchProperties } from "../properties.js";
import { PropertiesManager, type PropsOrAdjust } from "../segmentPropertiesManager.js";

describe("PropertiesManager", () => {
	describe("handleProperties", () => {
		it("should handle properties without collaboration", () => {
			const propertiesManager = new PropertiesManager();
			const seg = { properties: { key: "value" } };
			const op = { props: { key: "newValue" } };
			const deltas = propertiesManager.handleProperties(op, seg, 1, 1, true);
			assert.deepEqual(deltas, { key: "value" });
			assert.deepEqual(seg.properties, { key: "newValue" });
		});

		it("should handle properties with collaboration", () => {
			const propertiesManager = new PropertiesManager();
			const seg = { properties: { key: "value" } };
			const op = { props: { key: "newValue" } };
			const deltas = propertiesManager.handleProperties(
				op,
				seg,
				UnassignedSequenceNumber,
				1,
				true,
			);
			assert.deepEqual(deltas, { key: "value" });
			assert.deepEqual(seg.properties, { key: "newValue" });
		});

		it("should handle properties with rollback", () => {
			const propertiesManager = new PropertiesManager();
			const seg = { properties: { key: "value" } };
			const op = { props: { key: "newValue" } };
			// Simulate pending state for rollback
			const deltas1 = propertiesManager.handleProperties(
				op,
				seg,
				UnassignedSequenceNumber,
				1,
				true,
			);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
			const deltas2 = propertiesManager.rollbackProperties({ props: deltas1 }, seg, true);
			assert.deepEqual(deltas2, { key: "newValue" });
			assert.deepEqual(seg.properties, { key: "value" });
		});
	});

	describe("ack", () => {
		it("should acknowledge property changes", () => {
			const propertiesManager = new PropertiesManager();
			const op = { props: { key: "value" } };
			const seg = { properties: {} };

			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 1, true);
			assert(propertiesManager.hasPendingProperties({ key: "value" }));
			propertiesManager.ack(1, 0, op);
		});
	});

	describe("copyTo", () => {
		it("should copy properties and manager state", () => {
			const propertiesManager = new PropertiesManager();
			const op = { props: { key: "value" } };
			const seg = { properties: {} };

			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 1, true);
			assert(propertiesManager.hasPendingProperties({ key: "value" }));
			const dest: Pick<ISegmentLeaf, "properties" | "propertyManager"> = {};
			propertiesManager.copyTo({ key: "value" }, dest);
			assert(dest.propertyManager instanceof PropertiesManager);
			assert(dest.propertyManager.hasPendingProperties({ key: "value" }));
		});
	});

	describe("getAtSeq", () => {
		it("should retrieve properties at a specific sequence number", () => {
			const propertiesManager = new PropertiesManager();
			const op: PropsOrAdjust = { adjust: { key: { value: 5 } } };
			const seg = { properties: {} };

			propertiesManager.handleProperties(op, seg, 1, 0, true);
			const properties = propertiesManager.getAtSeq(seg.properties, 0);
			assert(matchProperties(properties, {}));
		});
	});

	describe("hasPendingProperties", () => {
		it("should check for pending properties", () => {
			const propertiesManager = new PropertiesManager();
			const op = { props: { key: "value" } };
			const seg = { properties: {} };

			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 1, true);
			assert(propertiesManager.hasPendingProperties({ key: "value" }));
			assert(!propertiesManager.hasPendingProperties({ otherKey: "otherValue" }));
		});
	});
});
