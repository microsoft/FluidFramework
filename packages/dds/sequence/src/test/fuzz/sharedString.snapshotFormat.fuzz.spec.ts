/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	createDDSFuzzSuite,
	type Client,
} from "@fluid-private/test-dds-utils";
import type {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import type { SharedStringFactory } from "../../sequenceFactory.js";
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

function assertClientSnapshot(client: Client<SharedStringFactory>): void {
	const explicitFlag: unknown = client.dataStoreRuntime.options.newMergeTreeSnapshotFormat;
	assert(explicitFlag === undefined || typeof explicitFlag === "boolean");
	const expectedFormat = explicitFlag ?? getRecordedFormat(client.channel.attributes) ?? false;
	const { summary } = client.channel.getAttachSummary();
	assertSnapshotFormat(client.channel, summary, expectedFormat);
}

class SnapshotFormatFuzzFactory extends SharedStringFuzzFactory {
	public constructor(
		private readonly initialFormat: boolean,
		private readonly loadedFormat: boolean | undefined,
	) {
		super();
	}

	public override create(
		runtime: IFluidDataStoreRuntime,
		id: string,
	): SharedStringClass {
		runtime.options.newMergeTreeSnapshotFormat = this.initialFormat;
		return super.create(runtime, id);
	}

	public override async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedStringClass> {
		const recordedFormat = getRecordedFormat(attributes);
		assert(recordedFormat !== undefined, "Expected the flag recorded by the source summary");
		runtime.options.newMergeTreeSnapshotFormat = this.loadedFormat;
		const channel = await super.load(runtime, id, services, attributes);
		assert.equal(getRecordedFormat(channel.attributes), recordedFormat);
		const { summary } = channel.getAttachSummary();
		assertSnapshotFormat(channel, summary, this.loadedFormat ?? recordedFormat);
		return channel;
	}
}

for (const initialFormat of [false, true]) {
	for (const loadedFormat of [undefined, !initialFormat]) {
		const workloadName =
			`SharedString snapshot format ${initialFormat ? "flat" : "legacy"} ` +
			(loadedFormat === undefined ? "inherited" : "overridden");
		describe(workloadName, () => {
			createDDSFuzzSuite(
				{
					...baseSharedStringModel,
					workloadName,
					factory: new SnapshotFormatFuzzFactory(initialFormat, loadedFormat),
					validateConsistency: async (a, b) => {
						await baseSharedStringModel.validateConsistency(a, b);
						assertClientSnapshot(a);
						assertClientSnapshot(b);
					},
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
