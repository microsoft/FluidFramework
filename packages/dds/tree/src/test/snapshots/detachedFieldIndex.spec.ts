/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { makeDetachedNodeToFieldCodec } from "../../core/tree/detachedFieldIndexCodec";
import { typeboxValidator } from "../../external-utilities";
import { RevisionTagCodec } from "../../shared-tree-core";
import { JsonCompatibleReadOnly, useDeterministicStableId } from "../../util";
// eslint-disable-next-line import/no-internal-modules
import { generateTestCases } from "../tree/detachedFieldIndex.spec";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools";

describe("DetachedFieldIndex - Snapshots", () => {
	useSnapshotDirectory("detached-field-index");
	const codec = makeDetachedNodeToFieldCodec(new RevisionTagCodec(), {
		jsonValidator: typeboxValidator,
	});
	useDeterministicStableId(() => {
		for (const { name, data: change } of generateTestCases()) {
			it(name, () => {
				const encoded = codec.encode(change);
				takeJsonSnapshot(encoded as JsonCompatibleReadOnly);
			});
		}
	});
});
