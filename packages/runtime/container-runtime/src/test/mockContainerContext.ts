/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState, ICriticalContainerError } from "@fluidframework/container-definitions";
import { IContainerContext } from "@fluidframework/container-definitions/internal";
import { ConfigTypes, type IConfigProviderBase } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentStorageService,
	ISummaryContext,
	type ISnapshotTree,
	MessageType,
	type IVersion,
} from "@fluidframework/driver-definitions/internal";
import { MockLogger, mixinMonitoringContext } from "@fluidframework/telemetry-utils/internal";
import {
	MockAudience,
	MockDeltaManager,
	MockQuorumClients,
} from "@fluidframework/test-runtime-utils/internal";

// Mock the storage layer so "submitSummary" works.
const defaultMockStorage: Partial<IDocumentStorageService> = {
	uploadSummaryWithContext: async (summary: ISummaryTree, context: ISummaryContext) => {
		return "fakeHandle";
	},
};

export const mockClientId = "mockClientId";

export const configProvider = (
	settings: Record<string, ConfigTypes>,
): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

export const getMockContainerContext = (
	params: {
		settings?: Record<string, ConfigTypes>;
		logger?;
		mockStorage?: Partial<IDocumentStorageService>;
		loadedFromVersion?: IVersion;
		baseSnapshot?: ISnapshotTree;
		submitFn?: (
			type: MessageType,
			contents: any,
			batch: boolean,
			metadata?: unknown,
		) => number;
		submitSignalFn?: (content: unknown, targetClientId?: string) => void;
	} = {},
	clientId: string,
): Partial<IContainerContext> => {
	const {
		settings = {},
		logger = new MockLogger(),
		mockStorage = defaultMockStorage,
		loadedFromVersion,
		baseSnapshot,
		submitFn = () => 0,
		submitSignalFn = () => {},
	} = params;

	const mockContext = {
		attachState: AttachState.Attached,
		deltaManager: new MockDeltaManager(),
		audience: new MockAudience(),
		quorum: new MockQuorumClients(),
		taggedLogger: mixinMonitoringContext(logger, configProvider(settings)).logger,
		clientDetails: { capabilities: { interactive: true } },
		closeFn: (_error?: ICriticalContainerError): void => {},
		updateDirtyContainerState: (_dirty: boolean) => {},
		getLoadedFromVersion: () => loadedFromVersion,
		submitFn,
		submitSignalFn,
		clientId,
		connected: true,
		storage: mockStorage as IDocumentStorageService,
		baseSnapshot,
	} satisfies Partial<IContainerContext>;

	// Update the delta manager's last message which is used for validation during summarization.
	mockContext.deltaManager.lastMessage = {
		clientId: mockClientId,
		type: MessageType.Operation,
		sequenceNumber: 0,
		timestamp: Date.now(),
		minimumSequenceNumber: 0,
		referenceSequenceNumber: 0,
		clientSequenceNumber: 0,
		contents: undefined,
	};
	return mockContext;
};
