/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { UnassignedSequenceNumber } from "../constants.js";
import type { ISegmentPrivate } from "../mergeTreeNodes.js";
import { matchProperties } from "../properties.js";
import {
	PropertiesManager,
	PropertiesRollback,
	type PropsOrAdjust,
} from "../segmentPropertiesManager.js";

describe("PropertiesManager", () => {
	describe("handleProperties", () => {
		it("should handle properties without collaboration", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			const deltas = propertiesManager.handleProperties(op, seg, 1, 0, false);
			assert.deepEqual(deltas, { key: "value" });
			assert.deepEqual(seg.properties, { key: "newValue" });
		});

		it("should handle properties with collaboration", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			const deltas = propertiesManager.handleProperties(
				op,
				seg,
				UnassignedSequenceNumber,
				0,
				true,
			);
			assert.deepEqual(deltas, { key: "value" });
			assert.deepEqual(seg.properties, { key: "newValue" });
		});

		it("should handle properties with rollback", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			// Simulate pending state for rollback
			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 0, true);
			const deltas = propertiesManager.handleProperties(
				op,
				seg,
				UnassignedSequenceNumber,
				0,
				true,
				PropertiesRollback.Rollback,
			);
			assert.deepEqual(deltas, { key: "newValue" });
			assert.deepEqual(seg.properties, { key: "value" });
		});

		it("should handle properties with seq as a number and collaborating true", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			const deltas = propertiesManager.handleProperties(op, seg, 2, 1, true);
			assert.deepEqual(deltas, { key: "value" });
			assert.deepEqual(seg.properties, { key: "newValue" });
		});

		it("should handle properties with seq as a number and collaborating false", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			const deltas = propertiesManager.handleProperties(op, seg, 2, 1, false);
			assert.deepEqual(deltas, { key: "value" });
			assert.deepEqual(seg.properties, { key: "newValue" });
		});

		it("should handle properties with adjusts", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: 1 },
			};
			const op: PropsOrAdjust = { adjust: { key: { delta: 1 } } };
			const deltas = propertiesManager.handleProperties(op, seg, 2, 1, true);
			assert.deepEqual(deltas, { key: 1 });
			assert.deepEqual(seg.properties, { key: 2 });
		});

		it("should handle properties with props and adjusts interleaved", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: 1, otherKey: "value" },
			};
			const op1: PropsOrAdjust = { props: { otherKey: "newValue" } };
			const op2: PropsOrAdjust = { adjust: { key: { delta: 1 } } };
			propertiesManager.handleProperties(op1, seg, 2, 1, true);
			const deltas = propertiesManager.handleProperties(op2, seg, 3, 2, true);
			assert.deepEqual(deltas, { key: 1 });
			assert.deepEqual(seg.properties, { key: 2, otherKey: "newValue" });
		});
	});

	describe("rollbackProperties", () => {
		it("should rollback properties when collaborating is true", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			const rollbackDeltas = propertiesManager.handleProperties(
				op,
				seg,
				UnassignedSequenceNumber,
				0,
				true,
			);
			const deltas = propertiesManager.rollbackProperties(
				{ props: rollbackDeltas },
				seg,
				true,
			);
			assert.deepEqual(deltas, { key: "newValue" });
			assert.deepEqual(seg.properties, { key: "value" });
		});

		it("should rollback properties when collaborating is false", () => {
			const propertiesManager = new PropertiesManager();
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {
				properties: { key: "value" },
			};
			const op: PropsOrAdjust = { props: { key: "newValue" } };
			const rollbackDeltas = propertiesManager.handleProperties(
				op,
				seg,
				UnassignedSequenceNumber,
				0,
				false,
			);
			const deltas = propertiesManager.rollbackProperties(
				{ props: rollbackDeltas },
				seg,
				false,
			);
			assert.deepEqual(deltas, { key: "newValue" });
			assert.deepEqual(seg.properties, { key: "value" });
		});
	});

	describe("ack", () => {
		it("should acknowledge property changes", () => {
			const propertiesManager = new PropertiesManager();
			const op: PropsOrAdjust = { props: { key: "value" } };
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = { properties: {} };

			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 1, true);
			assert(propertiesManager.hasPendingProperties({ key: "value" }));
			propertiesManager.ack(1, 0, op);
		});
	});

	describe("copyTo", () => {
		it("should copy properties and manager state", () => {
			const propertiesManager = new PropertiesManager();
			const op: PropsOrAdjust = { props: { key: "value" } };
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = { properties: {} };

			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 1, true);
			assert(propertiesManager.hasPendingProperties({ key: "value" }));
			const dest: Pick<ISegmentPrivate, "properties" | "propertyManager"> = {};
			propertiesManager.copyTo({ key: "value" }, dest);
			assert(dest.propertyManager instanceof PropertiesManager);
			assert(dest.propertyManager.hasPendingProperties({ key: "value" }));
		});
	});

	describe("getAtSeq", () => {
		it("should retrieve properties at a specific sequence number", () => {
			const propertiesManager = new PropertiesManager();
			const op: PropsOrAdjust = { adjust: { key: { delta: 5 } } };
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = { properties: {} };

			propertiesManager.handleProperties(op, seg, 1, 0, true);
			const properties = propertiesManager.getAtSeq(seg.properties, 0);
			assert(matchProperties(properties, {}));
		});
	});

	describe("hasPendingProperties", () => {
		it("should check for pending properties", () => {
			const propertiesManager = new PropertiesManager();
			const op: PropsOrAdjust = { props: { key: "value" } };
			const seg: Pick<ISegmentPrivate, "properties" | "propertyManager"> = { properties: {} };

			propertiesManager.handleProperties(op, seg, UnassignedSequenceNumber, 1, true);
			assert(propertiesManager.hasPendingProperties({ key: "value" }));
			assert(!propertiesManager.hasPendingProperties({ otherKey: "otherValue" }));
		});
	});
});
