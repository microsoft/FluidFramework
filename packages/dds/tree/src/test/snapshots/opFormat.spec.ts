/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	type MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";
import { SchemaFactory, TreeViewConfiguration } from "../../simple-tree/index.js";
import { type ISharedTree, SharedTreeFormatVersion } from "../../shared-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../util/index.js";
import { TreeFactory } from "../../treeFactory.js";

/**
 * This suite provides some e2e snapshot coverage for how SharedTree ops look.
 * Prefer to put exhaustive aspects of the op format in more specific snapshot tests.
 */
describe("SharedTree op format snapshots", () => {
	function spyOnFutureMessages(runtime: MockContainerRuntime): JsonCompatibleReadOnly[] {
		const messages: JsonCompatibleReadOnly[] = [];
		const originalSubmit = runtime.submit.bind(runtime);
		runtime.submit = (content, localOpMetadata) => {
			messages.push(content);
			return originalSubmit(content, localOpMetadata);
		};
		return messages;
	}

	const sb = new SchemaFactory("snapshots");
	class Point extends sb.object("Point", {
		x: sb.number,
		y: sb.number,
	}) {}

	let containerRuntime: MockContainerRuntime;
	let tree: ISharedTree;

	for (const versionKey of Object.keys(SharedTreeFormatVersion)) {
		describe(`using SharedTreeFormatVersion.${versionKey}`, () => {
			useSnapshotDirectory(`op-format/${versionKey}`);
			beforeEach(() => {
				const factory = new TreeFactory({
					formatVersion:
						SharedTreeFormatVersion[versionKey as keyof typeof SharedTreeFormatVersion],
				});
				const containerRuntimeFactory = new MockContainerRuntimeFactory({
					useProcessMessages: true,
				});
				const sessionId = "00000000-0000-4000-b000-000000000000" as SessionId;
				const runtime = new MockFluidDataStoreRuntime({
					idCompressor: createIdCompressor(sessionId),
					attachState: AttachState.Attached,
				});
				containerRuntime = containerRuntimeFactory.createContainerRuntime(runtime);
				tree = factory.create(runtime, "1");
				tree.connect({
					deltaConnection: runtime.createDeltaConnection(),
					objectStorage: new MockStorage(),
				});
			});

			it("schema change", () => {
				const messages = spyOnFutureMessages(containerRuntime);
				const view = tree.viewWith(new TreeViewConfiguration({ schema: Point }));
				view.initialize(new Point({ x: 0, y: 0 }));

				takeJsonSnapshot(messages);
			});

			it("field change", () => {
				const view = tree.viewWith(new TreeViewConfiguration({ schema: Point }));
				view.initialize(new Point({ x: 0, y: 2 }));

				const messages = spyOnFutureMessages(containerRuntime);
				view.root.x = 1;
				takeJsonSnapshot(messages);
			});
		});
	}
});
