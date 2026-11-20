/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChannelConfigurationSnapshotV1 } from "../../index.js";

interface NestedChannelConfiguration {
	readonly enabled: boolean;
}

interface TestChannelConfiguration {
	readonly nested: NestedChannelConfiguration;
	readonly entries: readonly NestedChannelConfiguration[];
	readonly optional?: NestedChannelConfiguration;
}

declare const snapshot: ChannelConfigurationSnapshotV1<TestChannelConfiguration>;
declare function useConfiguration(configuration: TestChannelConfiguration): void;
useConfiguration(snapshot.values);

interface InvalidNestedChannelConfiguration {
	readonly callback: () => void;
}

interface InvalidChannelConfiguration {
	readonly nested: InvalidNestedChannelConfiguration;
}

const invalidSnapshot: ChannelConfigurationSnapshotV1<InvalidChannelConfiguration> = {
	version: 1,
	revision: 0,
	values: {
		nested: {
			// @ts-expect-error Functions cannot be persisted as channel configuration.
			callback: () => {},
		},
	},
};
declare function useSnapshot(snapshot: unknown): void;
useSnapshot(invalidSnapshot);
