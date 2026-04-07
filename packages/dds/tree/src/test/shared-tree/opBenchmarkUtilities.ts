/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert, fail } from "node:assert";

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

/**
 * Hooks into a tree's `submitLocalMessage` to capture all submitted ops into `resultArray`.
 */
// TODO: better way to hook this up. Needs to detect local ops exactly once.
export function registerOpListener(
	tree: ITreePrivate,
	resultArray: ISequencedDocumentMessage[],
): void {
	const treeInternal = tree as ITreeWithSubmitLocalMessage;
	const oldSubmitLocalMessage = treeInternal.submitLocalMessage.bind(tree);
	function submitLocalMessage(content: unknown, localOpMetadata?: unknown): void {
		resultArray.push(content as ISequencedDocumentMessage);
		oldSubmitLocalMessage(content, localOpMetadata);
	}
	treeInternal.submitLocalMessage = submitLocalMessage;
}

export function utf8Length(data: JsonCompatibleReadOnly): number {
	return new TextEncoder().encode(JSON.stringify(data)).length;
}

/**
 * Returns total op size in bytes, max individual op size in bytes, and total op count
 * for the given array of ops.
 * @throws Errors if the input list is empty.
 */
export function getOperationsStats(
	operations: ISequencedDocumentMessage[],
): Record<string, number> {
	if (operations.length === 0) {
		throw new Error("No operations to calculate stats for.");
	}

	const lengths = operations.map((op) => utf8Length(op as unknown as JsonCompatibleReadOnly));
	return {
		"Total Op Size (Bytes)": lengths.reduce((a, b) => a + b, 0),
		"Total Ops:": operations.length,
	};
}

/**
 * Asserts that the given (x, y) points lie on a line, using R² ≥ `r2Threshold`.
 * Skipped when fewer than 3 points are provided, since 2 points always define a perfect line.
 */
export function assertLinear({
	points,
	r2Threshold = 0.999,
}: {
	/**
	 * The data points to test, where `x` is the axis value and `y` is the measured op size.
	 */
	readonly points: readonly { x: number; y: number }[];
	/**
	 * The minimum acceptable R² value.
	 * @defaultValue 0.999
	 */
	readonly r2Threshold?: number;
}): void {
	if (points.length <= 2) {
		fail("Expected at least 3 data points to assert linear relationship.");
	}
	const n = points.length;
	const meanX = points.reduce((s, p) => s + p.x, 0) / n;
	const meanY = points.reduce((s, p) => s + p.y, 0) / n;
	const ssXX = points.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
	const ssXY = points.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
	const ssYY = points.reduce((s, p) => s + (p.y - meanY) ** 2, 0);
	if (ssYY === 0) {
		return; // All y values equal — trivially linear.
	}
	const slope = ssXY / ssXX;
	const intercept = meanY - slope * meanX;
	const ssRes = points.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
	const r2 = 1 - ssRes / ssYY;
	assert(
		r2 >= r2Threshold,
		`Expected a linear relationship between axis and op size (R² ≥ ${r2Threshold}), got R² = ${r2.toFixed(6)}.`,
	);
}

/**
 * Asserts that op size varies by at most `maxDeltaBytes` across all measurements.
 * Skipped when fewer than 2 values are provided (e.g. in correctness mode).
 */
export function assertApproximatelyConstant({
	sizes,
	maxDeltaBytes,
}: {
	/**
	 * The measured op sizes to compare.
	 */
	readonly sizes: readonly number[];
	/**
	 * The maximum permitted difference between the largest and smallest op size.
	 */
	readonly maxDeltaBytes: number;
}): void {
	if (sizes.length <= 1) {
		fail("Expected at least 2 measurements to assert approximately constant op size.");
	}
	const delta = Math.max(...sizes) - Math.min(...sizes);
	assert(
		delta <= maxDeltaBytes,
		`Expected approximately constant op size (max delta ≤ ${maxDeltaBytes} B), got ${delta} B.`,
	);
}
