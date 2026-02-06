/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRandom } from "@fluid-private/stochastic-test-utils";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";

import { ddsModelMap } from "./ddsModels.js";
import type { Client } from "./localServerStressHarness.js";
import type { StressDataObject } from "./stressDataObject.js";

/**
 * Result of selecting a channel for an operation.
 * Contains all the context needed to perform an operation on a specific channel.
 */
export interface SelectedChannel {
	client: Client;
	datastore: StressDataObject;
	datastoreTag: `datastore-${number}`;
	channel: IChannel;
	channelTag: string;
}

/**
 * Tracks container state in memory for stress tests.
 *
 * Maintains a mapping of datastores to their channels and channel types,
 * enabling global type-first channel selection without repeatedly querying
 * the system under test for channel type metadata.
 *
 * Should be created fresh for each test seed.
 */
export class ContainerStateTracker {
	/**
	 * Maps datastoreTag → (channelTag → channelType)
	 */
	private readonly channelsByDatastore = new Map<`datastore-${number}`, Map<string, string>>();

	/**
	 * Registers a new datastore with its root directory channel.
	 */
	registerDatastore(tag: `datastore-${number}`): void {
		const directoryDdsModel = ddsModelMap.get("https://graph.microsoft.com/types/directory");
		assert(directoryDdsModel !== undefined, "directory DDS model must exist");
		this.channelsByDatastore.set(tag, new Map([["root", directoryDdsModel.factory.type]]));
	}

	/**
	 * Registers a new channel in a datastore.
	 */
	registerChannel(
		datastoreTag: `datastore-${number}`,
		channelTag: string,
		channelType: string,
	): void {
		const channelMap = this.channelsByDatastore.get(datastoreTag);
		assert(channelMap !== undefined, `datastore ${datastoreTag} must be registered`);
		channelMap.set(channelTag, channelType);
	}

	/**
	 * Gets the channel type for a given channel from the in-memory registry.
	 * Returns undefined if the channel is not registered.
	 */
	getChannelType(datastoreTag: `datastore-${number}`, channelTag: string): string | undefined {
		return this.channelsByDatastore.get(datastoreTag)?.get(channelTag);
	}

	/**
	 * Selects a channel for an operation using global type-first selection.
	 *
	 * Picks a channel type first across all datastores, then picks a channel
	 * of that type. This ensures even distribution across DDS types regardless
	 * of how many channels of each type exist.
	 *
	 * Uses in-memory type metadata to classify channels by type, but resolves
	 * actual channel availability from the client to handle not-yet-attached channels.
	 */
	async selectChannelForOperation(client: Client, random: IRandom): Promise<SelectedChannel> {
		const globalObjects = await client.entryPoint.getContainerObjects();
		const availableDatastores = globalObjects.filter((v) => v.type === "stressDataObject");

		// Collect actually-available channels, using in-memory state for type classification
		interface ChannelEntry {
			channel: IChannel;
			channelType: string;
			datastoreTag: `datastore-${number}`;
			datastore: StressDataObject;
		}
		const channelsByType = new Map<string, ChannelEntry[]>();

		for (const dsEntry of availableDatastores) {
			assert(dsEntry.type === "stressDataObject", "expected stressDataObject");
			const dsTag = dsEntry.tag;
			const datastore = dsEntry.stressDataObject;
			const channels = await datastore.StressDataObject.getChannels();
			for (const ch of channels) {
				// Use in-memory type if available, fall back to channel attributes
				const channelType = this.getChannelType(dsTag, ch.id) ?? ch.attributes.type;
				const entry: ChannelEntry = {
					channel: ch,
					channelType,
					datastoreTag: dsTag,
					datastore,
				};
				const existing = channelsByType.get(channelType);
				if (existing !== undefined) {
					existing.push(entry);
				} else {
					channelsByType.set(channelType, [entry]);
				}
			}
		}

		// Pick a type first, then a channel of that type
		const channelTypes = Array.from(channelsByType.keys());
		assert(channelTypes.length > 0, "at least one channel type must be available");
		const selectedType = random.pick(channelTypes);
		const entriesOfType = channelsByType.get(selectedType);
		assert(entriesOfType !== undefined, "channels of selected type must exist");
		const selected = random.pick(entriesOfType);

		return {
			client,
			datastore: selected.datastore,
			datastoreTag: selected.datastoreTag,
			channel: selected.channel,
			channelTag: selected.channel.id,
		};
	}
}
