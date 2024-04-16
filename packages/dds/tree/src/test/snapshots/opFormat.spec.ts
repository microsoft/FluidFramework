/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import { type SessionId, createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	type MockContainerRuntime,
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { takeJsonSnapshot, useSnapshotDirectory } from "./snapshotTools.js";
import { ITree, SchemaFactory } from "../../simple-tree/index.js";
import { SharedTreeFactory, SharedTreeFormatVersion } from "../../shared-tree/index.js";

/**
 * This suite provides some e2e snapshot coverage for how SharedTree ops look.
 * Prefer to put exhaustive aspects of the op format in more specific snapshot tests.
 */
describe("SharedTree op format snapshots", () => {
	useSnapshotDirectory("op-format");

	function spyOnFutureMessages(runtime: MockContainerRuntime): any[] {
		const messages: any[] = [];
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
	let tree: ITree;

	beforeEach(() => {
		const factory = new SharedTreeFactory({ formatVersion: SharedTreeFormatVersion.v1 });
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
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
		tree.schematize({
			schema: Point,
			initialTree: () => new Point({ x: 0, y: 0 }),
		});

		takeJsonSnapshot(messages);
	});

	it("field change", () => {
		const view = tree.schematize({
			schema: Point,
			initialTree: () => new Point({ x: 0, y: 2 }),
		});

		const messages = spyOnFutureMessages(containerRuntime);
		view.root.x = 1;
		takeJsonSnapshot(messages);
	});
});
