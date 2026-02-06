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
 * Per-client cache entry for a resolved channel.
 */
interface ResolvedChannel {
	channel: IChannel;
	datastore: StressDataObject;
}

/**
 * Tracks container state in memory for stress tests.
 *
 * Maintains a mapping of datastores to their channels and channel types,
 * enabling global type-first channel selection without repeatedly querying
 * the system under test for channel discovery or type metadata.
 *
 * Also caches resolved IChannel and StressDataObject instances per client
 * to avoid repeated expensive async resolution on every operation.
 *
 * Should be created fresh for each test seed.
 */
export class ContainerStateTracker {
	/**
	 * Maps datastoreTag to (channelTag to channelType)
	 */
	private readonly channelsByDatastore = new Map<`datastore-${number}`, Map<string, string>>();

	/**
	 * Inverse index: channelType to list of (datastoreTag, channelTag) pairs
	 */
	private readonly channelsByType = new Map<
		string,
		{ datastoreTag: `datastore-${number}`; channelTag: string }[]
	>();

	/**
	 * Per-client cache of resolved channels.
	 * Key: "clientTag:datastoreTag:channelTag"
	 */
	private readonly resolvedChannelCache = new Map<string, ResolvedChannel>();

	/**
	 * Registers a new datastore with its root directory channel.
	 */
	registerDatastore(tag: `datastore-${number}`): void {
		const directoryDdsModel = ddsModelMap.get("https://graph.microsoft.com/types/directory");
		assert(directoryDdsModel !== undefined, "directory DDS model must exist");
		const channelType = directoryDdsModel.factory.type;
		this.channelsByDatastore.set(tag, new Map([["root", channelType]]));
		this.addToTypeIndex(channelType, tag, "root");
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
		this.addToTypeIndex(channelType, datastoreTag, channelTag);
	}

	/**
	 * Gets the channel type for a given channel from the in-memory registry.
	 * Returns undefined if the channel is not registered.
	 */
	getChannelType(datastoreTag: `datastore-${number}`, channelTag: string): string | undefined {
		return this.channelsByDatastore.get(datastoreTag)?.get(channelTag);
	}

	/**
	 * Returns all registered channel names for a given datastore.
	 */
	getChannelNames(datastoreTag: `datastore-${number}`): string[] {
		const channelMap = this.channelsByDatastore.get(datastoreTag);
		return channelMap !== undefined ? Array.from(channelMap.keys()) : [];
	}

	/**
	 * Returns all registered datastore tags.
	 */
	getDatastoreTags(): `datastore-${number}`[] {
		return Array.from(this.channelsByDatastore.keys());
	}

	/**
	 * Resolves a specific channel for a given client, using the cache when available.
	 * Returns undefined if the channel cannot be resolved (e.g. not yet attached on this client).
	 */
	async resolveChannel(
		client: Client,
		datastoreTag: `datastore-${number}`,
		channelTag: string,
	): Promise<ResolvedChannel | undefined> {
		const cacheKey = `${client.tag}:${datastoreTag}:${channelTag}`;
		const cached = this.resolvedChannelCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		// Resolve the datastore for this client
		const globalObjects = await client.entryPoint.getContainerObjects();
		const dsEntry = globalObjects.find(
			(e) => e.type === "stressDataObject" && e.tag === datastoreTag,
		);
		if (dsEntry?.type !== "stressDataObject") {
			return undefined;
		}

		// Resolve the specific channel directly by name
		const channel = await dsEntry.stressDataObject.StressDataObject.getChannel(channelTag);
		if (channel === undefined) {
			return undefined;
		}

		const resolved: ResolvedChannel = {
			channel,
			datastore: dsEntry.stressDataObject,
		};
		this.resolvedChannelCache.set(cacheKey, resolved);
		return resolved;
	}

	/**
	 * Selects a channel for an operation using global type-first selection.
	 *
	 * Picks a channel type first from the in-memory registry, then picks a
	 * (datastoreTag, channelTag) of that type, and resolves just that channel
	 * on the given client. Retries with different candidates if the chosen
	 * channel is not yet available on this client.
	 *
	 * This avoids the O(datastores x channels) cost of scanning all channels
	 * on every operation.
	 */
	async selectChannelForOperation(client: Client, random: IRandom): Promise<SelectedChannel> {
		const channelTypes = Array.from(this.channelsByType.keys());
		assert(channelTypes.length > 0, "at least one channel type must be registered");
		const selectedType = random.pick(channelTypes);
		const candidates = this.channelsByType.get(selectedType);
		assert(candidates !== undefined && candidates.length > 0, "candidates must exist");

		// Shuffle candidates to try them in random order
		const shuffled = [...candidates];
		for (let i = shuffled.length - 1; i > 0; i--) {
			const j = random.integer(0, i);
			[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
		}

		// Try each candidate until we find one that resolves
		for (const candidate of shuffled) {
			const resolved = await this.resolveChannel(
				client,
				candidate.datastoreTag,
				candidate.channelTag,
			);
			if (resolved !== undefined) {
				return {
					client,
					datastore: resolved.datastore,
					datastoreTag: candidate.datastoreTag,
					channel: resolved.channel,
					channelTag: candidate.channelTag,
				};
			}
		}

		// If no candidate of the selected type resolved, fall back to trying all types
		for (const [type, typeCandidates] of this.channelsByType) {
			if (type === selectedType) {
				continue;
			}
			for (const candidate of typeCandidates) {
				const resolved = await this.resolveChannel(
					client,
					candidate.datastoreTag,
					candidate.channelTag,
				);
				if (resolved !== undefined) {
					return {
						client,
						datastore: resolved.datastore,
						datastoreTag: candidate.datastoreTag,
						channel: resolved.channel,
						channelTag: candidate.channelTag,
					};
				}
			}
		}

		// This should be unreachable since we always have at least the root channel on datastore-0
		throw new Error("no resolvable channel found across any type");
	}

	private addToTypeIndex(
		channelType: string,
		datastoreTag: `datastore-${number}`,
		channelTag: string,
	): void {
		const existing = this.channelsByType.get(channelType);
		if (existing !== undefined) {
			existing.push({ datastoreTag, channelTag });
		} else {
			this.channelsByType.set(channelType, [{ datastoreTag, channelTag }]);
		}
	}
}
