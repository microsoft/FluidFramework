/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRandom } from "@fluid-private/stochastic-test-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";

import { ddsModelMap } from "./ddsModels.js";
import type { Client } from "./localServerStressHarness.js";
import type { StressDataObject } from "./stressDataObject.js";

/**
 * Selection biasing constants.
 * Items with fewer picks get higher weight that decays toward 1.0 with each pick.
 * Formula: weight = 1 + INITIAL_BOOST / (1 + picks * DECAY_RATE)
 */
const INITIAL_BOOST = 4.0;
const DECAY_RATE = 2.0;

/**
 * Result of selecting a channel for an operation.
 * Contains all the context needed to perform an operation.
 */
export interface SelectedChannel {
	client: Client;
	datastore: StressDataObject;
	datastoreTag: `datastore-${number}`;
	channel: IChannel;
	channelTag: string;
	channelType: string;
}

/**
 * A handle with its tag for selection and serialization.
 */
export interface TaggedHandle {
	tag: string;
	handle: IFluidHandle;
}

/**
 * Consolidates all container state tracking and selection biasing for stress tests.
 * Should be created fresh for each test - no reset method provided.
 *
 * Manages:
 * - Channel tracking per datastore
 * - Container objects (datastores, blobs) by URL
 * - Selection biasing for datastores, handles, and channel types
 */
export class ContainerStateTracker {
	/**
	 * Maps datastoreTag → (channelTag → channelType)
	 */
	private readonly _channelsByDatastore = new Map<
		`datastore-${number}`,
		Map<string, string>
	>();

	/**
	 * Maps absolutePath to \{tag, type\}
	 */
	private readonly _containerObjectsByUrl = new Map<string, { tag: string; type: string }>();

	/**
	 * Tracks datastore selection counts for biasing.
	 */
	private readonly datastorePickCounts = new Map<string, number>();

	/**
	 * Tracks handle selection counts for biasing.
	 */
	private readonly handlePickCounts = new Map<string, number>();

	/**
	 * Tracks channel type creation counts for biasing.
	 */
	private readonly channelTypeCreationCounts = new Map<string, number>();

	/**
	 * Read-only view of channels by datastore.
	 */
	get channelsByDatastore(): ReadonlyMap<`datastore-${number}`, ReadonlyMap<string, string>> {
		return this._channelsByDatastore;
	}

	/**
	 * Read-only view of container objects by URL.
	 */
	get containerObjectsByUrl(): ReadonlyMap<string, { tag: string; type: string }> {
		return this._containerObjectsByUrl;
	}

	/**
	 * Registers a new datastore with its root channel.
	 */
	registerDatastore(tag: `datastore-${number}`, absoluteUrl: string): void {
		const directoryDdsModel = ddsModelMap.get("https://graph.microsoft.com/types/directory");
		assert(directoryDdsModel !== undefined, "directory DDS model must exist");
		const rootChannelType = directoryDdsModel.factory.type;
		this._channelsByDatastore.set(tag, new Map([["root", rootChannelType]]));
		this._containerObjectsByUrl.set(absoluteUrl, { tag, type: "stressDataObject" });
	}

	/**
	 * Registers a new channel in a datastore.
	 */
	registerChannel(
		datastoreTag: `datastore-${number}`,
		channelTag: string,
		channelType: string,
	): void {
		const channelMap = this._channelsByDatastore.get(datastoreTag);
		if (channelMap !== undefined) {
			channelMap.set(channelTag, channelType);
		}

		// Track for channel type biasing
		this.channelTypeCreationCounts.set(
			channelType,
			(this.channelTypeCreationCounts.get(channelType) ?? 0) + 1,
		);
	}

	/**
	 * Registers a blob.
	 */
	registerBlob(tag: `blob-${number}`, absoluteUrl: string): void {
		this._containerObjectsByUrl.set(absoluteUrl, { tag, type: "newBlob" });
	}

	/**
	 * Gets channels for a specific datastore.
	 */
	getChannelsForDatastore(
		datastoreTag: `datastore-${number}`,
	): Map<string, string> | undefined {
		return this._channelsByDatastore.get(datastoreTag);
	}

	/**
	 * Selects a channel for an operation using inverted selection (type first, then datastore).
	 * Uses weighted selection to bias toward less-used datastores.
	 *
	 * @param client - The client to use for resolving container objects
	 * @param random - Random number generator
	 * @returns Selected channel with all necessary context
	 */
	async selectChannelForOperation(client: Client, random: IRandom): Promise<SelectedChannel> {
		// Get available datastores for this client
		const globalObjects = await client.entryPoint.getContainerObjects(
			this._containerObjectsByUrl,
		);
		const availableDatastores = globalObjects.filter((v) => v.type === "stressDataObject");

		// Build a global list of all channels across all datastores, grouped by type
		interface ChannelEntry {
			channelTag: string;
			channelType: string;
			datastoreTag: `datastore-${number}`;
			datastore: (typeof availableDatastores)[0];
		}
		const channelsByType = new Map<string, ChannelEntry[]>();

		for (const currentDsEntry of availableDatastores) {
			const dsTag = currentDsEntry.tag as `datastore-${number}`;
			const dsChannelMap = this._channelsByDatastore.get(dsTag);
			if (dsChannelMap === undefined) {
				continue;
			}
			assert(currentDsEntry.type === "stressDataObject", "type narrowing");
			const currentChannelTags = Array.from(dsChannelMap.keys());
			const currentChannels =
				await currentDsEntry.stressDataObject.getChannels(currentChannelTags);
			const availableChannelIds = new Set(currentChannels.map((c) => c.id));

			for (const [currentChannelTag, channelType] of dsChannelMap.entries()) {
				if (!availableChannelIds.has(currentChannelTag)) {
					continue; // Skip channels that don't actually exist
				}
				const entry: ChannelEntry = {
					channelTag: currentChannelTag,
					channelType,
					datastoreTag: dsTag,
					datastore: currentDsEntry,
				};
				const existing = channelsByType.get(channelType);
				if (existing !== undefined) {
					existing.push(entry);
				} else {
					channelsByType.set(channelType, [entry]);
				}
			}
		}

		// First pick a channel type globally
		const channelTypes = Array.from(channelsByType.keys());
		assert(channelTypes.length > 0, "at least one channel type must be available");
		const selectedType = random.pick(channelTypes);
		const channelsOfSelectedType = channelsByType.get(selectedType);
		assert(channelsOfSelectedType !== undefined, "channels of selected type must exist");

		// Weighted selection favoring less-picked datastores
		const selectedChannel = this.weightedSelect(
			channelsOfSelectedType,
			(ch) => ch.datastoreTag,
			this.datastorePickCounts,
			random,
		);

		// Track datastore selection
		this.datastorePickCounts.set(
			selectedChannel.datastoreTag,
			(this.datastorePickCounts.get(selectedChannel.datastoreTag) ?? 0) + 1,
		);

		// Get the actual channel object
		const {
			datastoreTag,
			datastore: selectedDsEntry,
			channelTag: selectedChannelTag,
		} = selectedChannel;
		assert(selectedDsEntry.type === "stressDataObject", "type narrowing");
		const datastore = selectedDsEntry.stressDataObject;

		const selectedChannelMap = this._channelsByDatastore.get(datastoreTag);
		assert(selectedChannelMap !== undefined, "channel map must exist");
		const selectedChannelTags = Array.from(selectedChannelMap.keys());
		const selectedChannels = await datastore.getChannels(selectedChannelTags);
		const channel = selectedChannels.find((c) => c.id === selectedChannelTag);
		assert(channel !== undefined, `channel ${selectedChannelTag} must exist`);

		return {
			client,
			datastore,
			datastoreTag,
			channel,
			channelTag: selectedChannelTag,
			channelType: selectedChannel.channelType,
		};
	}

	/**
	 * Selects a handle with biasing toward less-picked handles.
	 * New handles get high weight that decays with picks, ensuring newly created
	 * datastores eventually get their handles stored in DDSs.
	 */
	selectHandle(random: IRandom, allHandles: TaggedHandle[]): TaggedHandle {
		const selected = this.weightedSelect(
			allHandles,
			(h) => h.tag,
			this.handlePickCounts,
			random,
		);
		this.handlePickCounts.set(
			selected.tag,
			(this.handlePickCounts.get(selected.tag) ?? 0) + 1,
		);
		return selected;
	}

	/**
	 * Selects a channel type with biasing toward under-represented types.
	 * Types with fewer channels get higher weight.
	 */
	selectChannelType(random: IRandom): string {
		const allTypes = [...ddsModelMap.keys()];
		return this.weightedSelect(allTypes, (t) => t, this.channelTypeCreationCounts, random);
	}

	/**
	 * Gathers all handles available for a given datastore context.
	 * Includes both channel handles and container object handles (datastores, blobs).
	 */
	async getAllHandles(
		client: Client,
		datastore: StressDataObject,
		datastoreTag: `datastore-${number}`,
	): Promise<TaggedHandle[]> {
		const channelMap = this._channelsByDatastore.get(datastoreTag);
		const channelTags = channelMap ? Array.from(channelMap.keys()) : ["root"];
		const channels = await datastore.getChannels(channelTags);

		const containerObjects = await client.entryPoint.getContainerObjects(
			this._containerObjectsByUrl,
		);

		return [
			...channels.map((c) => ({ tag: c.id, handle: c.handle })),
			...containerObjects.filter((v) => v.handle !== undefined),
		];
	}

	/**
	 * Generic weighted selection that biases toward items with fewer picks.
	 */
	private weightedSelect<T>(
		items: T[],
		getKey: (item: T) => string,
		pickCounts: Map<string, number>,
		random: IRandom,
	): T {
		const weights = items.map((item) => {
			const picks = pickCounts.get(getKey(item)) ?? 0;
			return 1 + INITIAL_BOOST / (1 + picks * DECAY_RATE);
		});

		const totalWeight = weights.reduce((a, b) => a + b, 0);
		let r = random.real(0, totalWeight);
		let selectedIndex = 0;
		for (let i = 0; i < items.length; i++) {
			r -= weights[i];
			if (r <= 0) {
				selectedIndex = i;
				break;
			}
		}

		return items[selectedIndex];
	}
}
