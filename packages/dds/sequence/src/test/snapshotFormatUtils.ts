/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SummaryType, type ISummaryTree } from "@fluidframework/driver-definitions/internal";

import { SharedStringFactory } from "../sequenceFactory.js";
import type { ISharedString } from "../sharedString.js";

export function assertSnapshotFormat(
	sharedString: ISharedString,
	summary: ISummaryTree,
	useFlatFormat: boolean,
): void {
	const content = summary.tree.content;
	assert(content.type === SummaryType.Tree);
	const header = content.tree.header;
	assert(header.type === SummaryType.Blob);
	assert(typeof header.content === "string");
	const chunk: unknown = JSON.parse(header.content);
	assert(typeof chunk === "object" && chunk !== null);
	assert.equal(
		"version" in chunk ? chunk.version : undefined,
		useFlatFormat ? "1" : undefined,
	);
	assert.equal("segments" in chunk, useFlatFormat);
	assert.equal("segmentTexts" in chunk, !useFlatFormat);
	if (useFlatFormat) {
		assert.equal(content.tree.catchupOps, undefined);
	}
	assert("newMergeTreeSnapshotFormat" in sharedString.attributes);
	assert.equal(sharedString.attributes.newMergeTreeSnapshotFormat, useFlatFormat);
	assert.equal(
		sharedString.attributes.snapshotFormatVersion,
		SharedStringFactory.Attributes.snapshotFormatVersion,
	);
}
