/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRandom } from "@fluid-private/stochastic-test-utils";
import type {
	IFluidHandle,
	IFluidLoadable,
	FluidObject,
} from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { RuntimeHeaders, toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { timeoutAwait } from "@fluidframework/test-utils/internal";

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
 * Resolved container object (datastore or blob).
 */
export interface ResolvedContainerObject {
	type: "stressDataObject" | "blob";
	tag: string;
	handle: IFluidHandle;
	stressDataObject?: StressDataObject;
}

/**
 * Tracks container state in memory for stress tests.
 *
 * Maintains a mapping of datastores to their channels and channel types,
 * enabling global type-first channel selection without repeatedly querying
 * the system under test for channel discovery or type metadata.
 *
 * Also tracks container object (datastore/blob) handle paths for
 * cross-client discovery without relying on a Fluid SharedMap.
 *
 * Caches resolved IChannel and StressDataObject instances per client
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
	 * Maps object tag to its handle absolute path and type.
	 * Stores all registered datastores and blobs.
	 */
	private readonly objectPaths = new Map<
		string,
		{ absolutePath: string; type: "stressDataObject" | "blob" }
	>();

	/**
	 * Per-client cache of resolved container objects.
	 * Key: "clientTag:objectTag"
	 */
	private readonly resolvedObjectCache = new Map<string, ResolvedContainerObject>();

	/**
	 * Registers a new datastore with its root directory channel and handle path.
	 */
	registerDatastore(tag: `datastore-${number}`, handle: IFluidHandle): void {
		const directoryDdsModel = ddsModelMap.get("https://graph.microsoft.com/types/directory");
		assert(directoryDdsModel !== undefined, "directory DDS model must exist");
		const channelType = directoryDdsModel.factory.type;
		this.channelsByDatastore.set(tag, new Map([["root", channelType]]));
		this.addToTypeIndex(channelType, tag, "root");
		this.objectPaths.set(tag, {
			absolutePath: toFluidHandleInternal(handle).absolutePath,
			type: "stressDataObject",
		});
	}

	/**
	 * Registers a new blob with its handle path.
	 */
	registerBlob(tag: `blob-${number}`, handle: IFluidHandle): void {
		this.objectPaths.set(tag, {
			absolutePath: toFluidHandleInternal(handle).absolutePath,
			type: "blob",
		});
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
	 * Resolves a container object (datastore or blob) by tag for a given client.
	 * Uses the stored absolute path and resolveHandle to find the object.
	 * Returns undefined if the object is not yet available on this client.
	 */
	async resolveContainerObject(
		client: Client,
		tag: string,
	): Promise<ResolvedContainerObject | undefined> {
		const cacheKey = `${client.tag}:${tag}`;
		const cached = this.resolvedObjectCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		const pathEntry = this.objectPaths.get(tag);
		if (pathEntry === undefined) {
			return undefined;
		}

		const containerRuntime = client.entryPoint.containerRuntimeForTest;
		const resp = await timeoutAwait(
			containerRuntime.resolveHandle({
				url: pathEntry.absolutePath,
				headers: { [RuntimeHeaders.wait]: false },
			}),
			{
				errorMsg: `Timed out waiting for client to resolveHandle: ${pathEntry.absolutePath}`,
			},
		);

		if (resp.status !== 200) {
			return undefined;
		}

		const maybe: FluidObject<IFluidLoadable & StressDataObject> | undefined = resp.value;
		const handle = maybe?.IFluidLoadable?.handle;
		if (handle === undefined) {
			return undefined;
		}

		const resolved: ResolvedContainerObject = {
			type: pathEntry.type,
			tag,
			handle,
			stressDataObject:
				pathEntry.type === "stressDataObject" ? maybe?.StressDataObject : undefined,
		};
		this.resolvedObjectCache.set(cacheKey, resolved);
		return resolved;
	}

	/**
	 * Resolves all registered container objects for a given client.
	 * Objects that are not yet available on this client are skipped.
	 */
	async resolveAllContainerObjects(client: Client): Promise<ResolvedContainerObject[]> {
		const results: ResolvedContainerObject[] = [];
		for (const tag of this.objectPaths.keys()) {
			const resolved = await this.resolveContainerObject(client, tag);
			if (resolved !== undefined) {
				results.push(resolved);
			}
		}
		return results;
	}

	/**
	 * Collects all handles (channels + container objects) available to a client
	 * for a specific datastore. Used for DDS operations that need handle references.
	 */
	async getAllHandles(
		client: Client,
		datastore: StressDataObject,
		datastoreTag: `datastore-${number}`,
	): Promise<{ tag: string; handle: IFluidHandle }[]> {
		// Resolve channels for this datastore
		const channelNames = this.getChannelNames(datastoreTag);
		const handles: { tag: string; handle: IFluidHandle }[] = [];
		for (const name of channelNames) {
			const ch = await datastore.getChannel(name);
			if (ch !== undefined) {
				handles.push({ tag: ch.id, handle: ch.handle });
			}
		}

		// Add all resolvable container objects
		const containerObjects = await this.resolveAllContainerObjects(client);
		for (const obj of containerObjects) {
			handles.push({ tag: obj.tag, handle: obj.handle });
		}

		return handles;
	}

	/**
	 * Resolves a specific channel for a given client, using the cache when available.
	 * Uses the state tracker's object paths to resolve the datastore instead of
	 * getContainerObjects().
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

		// Resolve the datastore for this client using stored paths
		const dsObj = await this.resolveContainerObject(client, datastoreTag);
		if (dsObj?.stressDataObject === undefined) {
			return undefined;
		}

		// Resolve the specific channel directly by name
		const channel = await dsObj.stressDataObject.StressDataObject.getChannel(channelTag);
		if (channel === undefined) {
			return undefined;
		}

		const resolved: ResolvedChannel = {
			channel,
			datastore: dsObj.stressDataObject,
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
