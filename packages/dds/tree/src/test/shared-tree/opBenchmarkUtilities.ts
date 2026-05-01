/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

import { ValueType, type CollectedData } from "@fluid-tools/benchmark";
import type { ISequencedDocumentMessage } from "@fluidframework/driver-definitions/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import type { ITreePrivate } from "../../shared-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { DefaultTestSharedTreeKind } from "../utils.js";

/**
 * Creates a default attached SharedTree for op submission.
 */
export function createConnectedTree(): ITreePrivate {
	const containerRuntimeFactory = new MockContainerRuntimeFactory();
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		idCompressor: createIdCompressor(),
	});
	containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const tree = DefaultTestSharedTreeKind.getFactory().create(dataStoreRuntime, "tree");
	tree.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return tree;
}

interface ITreeWithSubmitLocalMessage extends ITreePrivate {
	submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void;
}
interface ITreeWithSubmitLocalMessage {
	submitLocalMessage: (content: unknown, localOpMetadata?: unknown) => void;
}

/**
 * Intercepts outgoing ops on `tree` by monkey-patching `submitLocalMessage`, appending each
 * submitted op to `resultArray` before forwarding it normally.
 */
export function registerOpListener(
	tree: ITreePrivate,
	resultArray: ISequencedDocumentMessage[],
): void {
	// TODO: better way to hook this up. Needs to detect local ops exactly once.
	const treeInternal = tree as unknown as ITreeWithSubmitLocalMessage;
	const oldSubmitLocalMessage = treeInternal.submitLocalMessage.bind(tree);
	function submitLocalMessage(content: unknown, localOpMetadata?: unknown): void {
		resultArray.push(content as ISequencedDocumentMessage);
		oldSubmitLocalMessage(content, localOpMetadata);
	}
	treeInternal.submitLocalMessage = submitLocalMessage;
}

/**
 * Returns the UTF-8 byte length of `data` after JSON serialization.
 */
export function utf8Length(data: JsonCompatibleReadOnly): number {
	return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * Size statistics computed from a sequence of ops by {@link getOperationsStats}.
 */
export interface OperationsStats {
	"Total Op Size (Bytes)": number;
	"Max Op Size (Bytes)": number;
	"Total Ops:": number;
}

/**
 * Computes size statistics for a sequence of ops: total byte size, maximum single-op byte size,
 * and total op count.
 */
export function getOperationsStats(operations: ISequencedDocumentMessage[]): OperationsStats {
	const lengths = operations.map((operation) =>
		utf8Length(operation as unknown as JsonCompatibleReadOnly),
	);
	const totalOpBytes = lengths.reduce((a, b) => a + b, 0);
	const maxOpSizeBytes = Math.max(...lengths);

	return {
		"Total Op Size (Bytes)": totalOpBytes,
		"Max Op Size (Bytes)": maxOpSizeBytes,
		"Total Ops:": operations.length,
	};
}

/**
 * Converts {@link OperationsStats} into the {@link CollectedData} format expected by `benchmarkIt`.
 * "Total Op Size" is designated as the primary measurement.
 */
export function opStatsToCollectedData(opStats: OperationsStats): CollectedData {
	return [
		{
			name: "Total Op Size",
			value: opStats["Total Op Size (Bytes)"],
			units: "bytes",
			type: ValueType.SmallerIsBetter,
			significance: "Primary",
		},
		{
			name: "Max Op Size",
			value: opStats["Max Op Size (Bytes)"],
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
		{
			name: "Total Ops",
			value: opStats["Total Ops:"],
			units: "count",
		},
	];
}

/**
 * Asserts that the given (x, y) points lie on a line using exact equality.
 * @returns The slope and intercept of the line defined by the first two distinct x-values.
 * @throws Throws when fewer than 3 points are provided, since 2 points always define a line.
 * @throws Throws when two points share an x-value but have different y-values.
 * @throws Throws when all points share the same x-value (no unique line can be determined).
 * @throws Throws when any point does not lie exactly on the line defined by the first two distinct x-values.
 * @remarks
 * This is intended for use with deterministic data (e.g., integer byte counts produced by a fixed
 * encoding). Because exact equality is used, any measurement noise or non-determinism will cause
 * spurious failures — do not use this with randomly-varying measurements.
 */
export function assertLinear({
	points,
}: {
	/**
	 * The data points to test, where `x` is the axis value and `y` is the measured output size.
	 */
	readonly points: readonly { x: number; y: number }[];
}): { slope: number; intercept: number } {
	if (points.length <= 2) {
		fail("Expected at least 3 data points to assert linear relationship.");
	}

	// Collect unique (x, y) pairs, asserting same-x points are consistent.
	const yByX = new Map<number, number>();
	for (const { x, y } of points) {
		const existing = yByX.get(x);
		if (existing === undefined) {
			yByX.set(x, y);
		} else {
			assert(existing === y, `Ambiguous data: x=${x} maps to both y=${existing} and y=${y}.`);
		}
	}

	if (yByX.size < 2) {
		fail("Expected at least 2 distinct x-values to determine a line.");
	}

	// Form the reference line from the first two distinct-x points.
	const uniquePoints = [...yByX.entries()];
	const [x0, y0] = uniquePoints[0];
	const [x1, y1] = uniquePoints[1];
	const dx = x1 - x0;
	const dy = y1 - y0;

	// Assert each remaining unique point lies exactly on the line.
	// Rearranging y - y0 = (dy/dx)(x - x0) to avoid floating-point division:
	// (y - y0) * dx === dy * (x - x0)
	for (const [x, y] of uniquePoints.slice(2)) {
		assert(
			(y - y0) * dx === dy * (x - x0),
			`Expected (x=${x}, y=${y}) to lie exactly on the line through (${x0}, ${y0}) and (${x1}, ${y1}).`,
		);
	}

	return { slope: dy / dx, intercept: y0 - (dy / dx) * x0 };
}
