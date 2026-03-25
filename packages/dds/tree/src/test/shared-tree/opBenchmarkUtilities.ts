/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 */
export function getOperationsStats(operations: ISequencedDocumentMessage[]): {
	"Total Op Size (Bytes)": number;
	"Max Op Size (Bytes)": number;
	"Total Ops": number;
} {
	const lengths = operations.map((op) => utf8Length(op as unknown as JsonCompatibleReadOnly));
	return {
		"Total Op Size (Bytes)": lengths.reduce((a, b) => a + b, 0),
		"Max Op Size (Bytes)": Math.max(...lengths),
		"Total Ops:": operations.length,
	};
}
