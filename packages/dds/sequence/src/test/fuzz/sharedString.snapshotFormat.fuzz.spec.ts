/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";
import { createDDSFuzzSuite } from "@fluid-private/test-dds-utils";
import type {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import type { SharedStringClass } from "../../sharedString.js";
import { assertSnapshotFormat, getSnapshotFormat } from "../snapshotFormatUtils.js";

import {
	baseSharedStringModel,
	defaultFuzzOptions,
	SharedStringFuzzFactory,
} from "./fuzzUtils.js";

function observeSnapshots(
	channel: SharedStringClass,
	runtime: IFluidDataStoreRuntime,
	loadedFormat = false,
): SharedStringClass {
	let rememberedFormat = loadedFormat;
	const summarize = channel.getAttachSummary.bind(channel);
	channel.getAttachSummary = (...args) => {
		const explicitFlag: unknown = runtime.options.newMergeTreeSnapshotFormat;
		assert(explicitFlag === undefined || typeof explicitFlag === "boolean");
		const expectedFormat = explicitFlag ?? rememberedFormat;
		const result = summarize(...args);
		assertSnapshotFormat(channel, result.summary, expectedFormat);
		rememberedFormat = expectedFormat;
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
		const header = await services.objectStorage.readBlob("content/header");
		const loadedSnapshotFormat = getSnapshotFormat(bufferToString(header, "utf8"));
		if (this.loadedFormat === undefined) {
			assert.equal(loadedSnapshotFormat, this.initialFormat);
		}
		runtime.options.newMergeTreeSnapshotFormat = this.loadedFormat;
		const channel = await super.load(runtime, id, services, attributes);
		return observeSnapshots(channel, runtime, loadedSnapshotFormat);
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
