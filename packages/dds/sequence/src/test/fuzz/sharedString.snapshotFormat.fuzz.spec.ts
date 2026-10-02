/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import type {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import type { SharedStringClass } from "../../sharedString.js";
import { assertSnapshotFormat } from "../snapshotFormatUtils.js";

import {
	baseSharedStringModel,
	defaultFuzzOptions,
	SharedStringFuzzFactory,
} from "./fuzzUtils.js";

function getRecordedFormat(attributes: IChannelAttributes): boolean | undefined {
	const value =
		"newMergeTreeSnapshotFormat" in attributes
			? attributes.newMergeTreeSnapshotFormat
			: undefined;
	assert(value === undefined || typeof value === "boolean");
	return value;
}

function observeSnapshots(
	channel: SharedStringClass,
	runtime: IFluidDataStoreRuntime,
): SharedStringClass {
	const summarize = channel.getAttachSummary.bind(channel);
	channel.getAttachSummary = (...args) => {
		const explicitFlag: unknown = runtime.options.newMergeTreeSnapshotFormat;
		assert(explicitFlag === undefined || typeof explicitFlag === "boolean");
		const expectedFormat = explicitFlag ?? getRecordedFormat(channel.attributes) ?? false;
		const result = summarize(...args);
		assertSnapshotFormat(channel, result.summary, expectedFormat);
		return result;
	};
	return channel;
}

class SnapshotFormatFuzzFactory extends SharedStringFuzzFactory {
	public constructor(
		private readonly initialFormat: boolean,
		private readonly loadedFormat: boolean | undefined,
	) {
		super();
	}

	public override create(runtime: IFluidDataStoreRuntime, id: string): SharedStringClass {
		runtime.options.newMergeTreeSnapshotFormat = this.initialFormat;
		return observeSnapshots(super.create(runtime, id), runtime);
	}

	public override async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedStringClass> {
		const recordedFormat = getRecordedFormat(attributes);
		assert(recordedFormat !== false, "Legacy summaries must omit the recorded flag");
		if (this.loadedFormat === undefined) {
			assert.equal(recordedFormat, this.initialFormat ? true : undefined);
		}
		runtime.options.newMergeTreeSnapshotFormat = this.loadedFormat;
		const channel = await super.load(runtime, id, services, attributes);
		assert.equal(getRecordedFormat(channel.attributes), recordedFormat);
		return observeSnapshots(channel, runtime);
	}
}

for (const initialFormat of [false, true]) {
	for (const loadedFormat of [undefined, !initialFormat]) {
		const formatName = initialFormat ? "flat" : "legacy";
		const selectionName = loadedFormat === undefined ? "inherited" : "overridden";
		const workloadName = `SharedString snapshot format ${formatName} ${selectionName}`;
		describe(workloadName, () => {
			createDDSFuzzSuite(
				{
					...baseSharedStringModel,
					workloadName,
					factory: new SnapshotFormatFuzzFactory(initialFormat, loadedFormat),
				},
				{
					...defaultFuzzOptions,
					clientJoinOptions: {
						maxNumberOfClients: 6,
						clientAddProbability: 0.1,
						stashableClientProbability: 0.2,
					},
				},
			);
		});
	}
}
