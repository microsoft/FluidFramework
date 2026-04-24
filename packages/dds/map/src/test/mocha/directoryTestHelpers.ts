/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
	type MockContainerRuntime,
} from "@fluidframework/test-runtime-utils/internal";

import {
	type DirectoryLocalOpMetadata,
	type IDirectoryOperation,
	SharedDirectory as SharedDirectoryInternal,
} from "../../directory.js";
import { DirectoryFactory } from "../../directoryFactory.js";
import type { ISharedDirectory } from "../../interfaces.js";

const directoryFactory = new DirectoryFactory();

/**
 * A single attached+connected SharedDirectory client and its mock plumbing.
 */
export interface ConnectedDirectoryClient {
	sharedDirectory: ISharedDirectory;
	dataStoreRuntime: MockFluidDataStoreRuntime;
	containerRuntime: MockContainerRuntime;
}

/**
 * A test fixture containing a `MockContainerRuntimeFactory` plus one connected client.
 */
export interface ConnectedDirectoryTest extends ConnectedDirectoryClient {
	containerRuntimeFactory: MockContainerRuntimeFactory;
}

/**
 * Create a `MockContainerRuntimeFactory` (TurnBased) plus a single connected attached client.
 */
export function setupConnectedDirectoryTest(): ConnectedDirectoryTest {
	const containerRuntimeFactory = new MockContainerRuntimeFactory({ flushMode: 1 });
	const client = createAdditionalClient(containerRuntimeFactory, "1", "shared-directory-1");
	return { ...client, containerRuntimeFactory };
}

/**
 * Attach and connect another client to an existing `MockContainerRuntimeFactory`.
 */
export function createAdditionalClient(
	containerRuntimeFactory: MockContainerRuntimeFactory,
	id: string = "client-2",
	directoryId: string = `shared-directory-${id}`,
): ConnectedDirectoryClient {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
	const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
	const sharedDirectory = directoryFactory.create(dataStoreRuntime, directoryId);
	dataStoreRuntime.setAttachState(AttachState.Attached);
	sharedDirectory.connect({
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(),
	});
	return { sharedDirectory, dataStoreRuntime, containerRuntime };
}

/**
 * `SharedDirectoryInternal` with hooks for capturing local op metadata and invoking `applyStashedOp`
 * from tests.
 */
export class TestSharedDirectory extends SharedDirectoryInternal {
	private lastMetadata?: DirectoryLocalOpMetadata;
	public testApplyStashedOp(content: IDirectoryOperation): DirectoryLocalOpMetadata | undefined {
		this.lastMetadata = undefined;
		this.applyStashedOp(content);
		return this.lastMetadata;
	}
	public submitLocalMessage(op: IDirectoryOperation, localOpMetadata: unknown): void {
		this.lastMetadata = localOpMetadata as DirectoryLocalOpMetadata;
		super.submitLocalMessage(op, localOpMetadata);
	}
}
