/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { bufferToString } from "@fluid-internal/client-utils";
import {
	createDDSFuzzSuite,
	type DDSFuzzModel,
	type DDSFuzzTestState,
} from "@fluid-private/test-dds-utils";
import type {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";

import type { SharedStringClass } from "../../sharedString.js";
import type { SharedStringFactory, SharedStringOptions } from "../../sequenceFactory.js";
import { assertSnapshotFormat, getSnapshotFormat } from "../snapshotFormatUtils.js";

import {
	baseSharedStringModel,
	defaultFuzzOptions,
	makeReducer,
	SharedStringFuzzFactory,
	type Operation,
} from "./fuzzUtils.js";

type SnapshotFormatFuzzState = DDSFuzzTestState<SharedStringFactory, SharedStringOptions>;

function observeSnapshots(
	channel: SharedStringClass,
	runtime: IFluidDataStoreRuntime,
	factoryFormat: boolean | undefined,
	loadedFormat = false,
): SharedStringClass {
	let rememberedFormat = loadedFormat;
	const summarize = channel.getAttachSummary.bind(channel);
	channel.getAttachSummary = (...args) => {
		const explicitFlag: unknown = runtime.options.newMergeTreeSnapshotFormat;
		assert(explicitFlag === undefined || typeof explicitFlag === "boolean");
		const expectedFormat = factoryFormat ?? explicitFlag ?? rememberedFormat;
		const result = summarize(...args);
		assertSnapshotFormat(channel, result.summary, expectedFormat);
		rememberedFormat = expectedFormat;
		return result;
	};
	return channel;
}

class SnapshotFormatFuzzFactory extends SharedStringFuzzFactory {
	public constructor(private readonly snapshotOptions: SharedStringOptions) {
		super(snapshotOptions);
	}

	public override create(runtime: IFluidDataStoreRuntime, id: string): SharedStringClass {
		return observeSnapshots(
			super.create(runtime, id),
			runtime,
			this.snapshotOptions.newMergeTreeSnapshotFormat,
		);
	}

	public override async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<SharedStringClass> {
		const header = await services.objectStorage.readBlob("content/header");
		const loadedSnapshotFormat = getSnapshotFormat(bufferToString(header, "utf8"));
		const channel = await super.load(runtime, id, services, attributes);
		return observeSnapshots(
			channel,
			runtime,
			this.snapshotOptions.newMergeTreeSnapshotFormat,
			loadedSnapshotFormat,
		);
	}
}

for (const initialFormat of [false, true]) {
	for (const loadedFormat of [undefined, !initialFormat]) {
		const formatName = initialFormat ? "flat" : "legacy";
		const selectionName = loadedFormat === undefined ? "inherited" : "overridden";
		const workloadName = `SharedString snapshot format ${formatName} ${selectionName}`;
		describe(workloadName, () => {
			const model: DDSFuzzModel<SharedStringFactory, Operation, SnapshotFormatFuzzState> = {
				...baseSharedStringModel,
				workloadName,
				reducer: makeReducer<SnapshotFormatFuzzState>(),
				factory: {
					generateClientConfiguration: (random, { clientId, isSummarizer }) => {
						if (clientId === "A") {
							return { newMergeTreeSnapshotFormat: initialFormat };
						}
						if (isSummarizer) {
							return loadedFormat === undefined
								? {}
								: { newMergeTreeSnapshotFormat: loadedFormat };
						}
						return random.pick<SharedStringOptions>([
							{},
							{ newMergeTreeSnapshotFormat: true },
							{ newMergeTreeSnapshotFormat: false },
						]);
					},
					getFactory: (clientConfiguration) =>
						new SnapshotFormatFuzzFactory(clientConfiguration),
				},
			};
			createDDSFuzzSuite(model, {
				...defaultFuzzOptions,
				clientJoinOptions: {
					maxNumberOfClients: 6,
					clientAddProbability: 0.1,
					stashableClientProbability: 0.2,
				},
			});
		});
	}
}
