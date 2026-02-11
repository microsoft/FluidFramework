/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRandom } from "@fluid-private/stochastic-test-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";

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
	channelTag: `channel-${number}`;
}

/**
 * Resolved container object (datastore or blob).
 */
export interface ResolvedContainerObject {
	type: "stressDataObject" | "blob";
	tag: `datastore-${number}` | `blob-${number}`;
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
 * Should be created fresh for each test seed.
 */
export class ContainerStateTracker {
	/**
	 * Maps datastoreTag to (channelTag to channelType)
	 */
	private readonly channelsByDatastore = new Map<
		`datastore-${number}`,
		Map<`channel-${number}`, string>
	>();

	/**
	 * Inverse index: channelType to list of (datastoreTag, channelTag) pairs
	 */
	private readonly channelsByType = new Map<
		string,
		{ datastoreTag: `datastore-${number}`; channelTag: `channel-${number}` }[]
	>();

	/**
	 * Maps object tag to its handle absolute path and type.
	 * Stores all registered datastores and blobs.
	 */
	private readonly objectPaths = new Map<
		`datastore-${number}` | `blob-${number}`,
		{ absolutePath: string; type: "stressDataObject" | "blob" }
	>();

	/**
	 * Registers a new datastore with its root directory channel and handle path.
	 */
	registerDatastore(tag: `datastore-${number}`, handle: IFluidHandle): void {
		const directoryDdsModel = ddsModelMap.get("https://graph.microsoft.com/types/directory");
		assert(directoryDdsModel !== undefined, "directory DDS model must exist");
		const channelType = directoryDdsModel.factory.attributes.type;
		// Every datastore has a root directory channel. It doesn't follow the channel-N naming
		// convention, but that's harmless since tags are only used for informational tracking.
		const rootChannelTag = "root" as `channel-${number}`;
		this.channelsByDatastore.set(tag, new Map([[rootChannelTag, channelType]]));
		this.addToTypeIndex(channelType, tag, rootChannelTag);
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
		channelTag: `channel-${number}`,
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
	getChannelType(
		datastoreTag: `datastore-${number}`,
		channelTag: `channel-${number}`,
	): string | undefined {
		return this.channelsByDatastore.get(datastoreTag)?.get(channelTag);
	}

	/**
	 * Returns all registered channel names for a given datastore.
	 */
	getChannelNames(datastoreTag: `datastore-${number}`): `channel-${number}`[] {
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
	 * Uses the stored absolute path and the client's resolveByAbsolutePath method.
	 * Returns undefined if the object is not yet available on this client.
	 */
	async resolveContainerObject(
		client: Client,
		tag: `datastore-${number}` | `blob-${number}`,
	): Promise<ResolvedContainerObject | undefined> {
		const pathEntry = this.objectPaths.get(tag);
		if (pathEntry === undefined) {
			return undefined;
		}

		const resolved = await client.entryPoint.resolveByAbsolutePath(pathEntry.absolutePath);
		if (resolved === undefined) {
			return undefined;
		}

		return {
			type: pathEntry.type,
			tag,
			handle: resolved.handle,
			stressDataObject:
				pathEntry.type === "stressDataObject" ? resolved.stressDataObject : undefined,
		};
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
		const channelNames = this.getChannelNames(datastoreTag);
		const handles: { tag: string; handle: IFluidHandle }[] = [];
		for (const name of channelNames) {
			const ch = await datastore.getChannel(name);
			if (ch !== undefined) {
				handles.push({ tag: ch.id, handle: ch.handle });
			}
		}

		const containerObjects = await this.resolveAllContainerObjects(client);
		for (const obj of containerObjects) {
			handles.push({ tag: obj.tag, handle: obj.handle });
		}

		return handles;
	}

	/**
	 * Resolves a specific channel for a given client.
	 * Returns undefined if the channel cannot be resolved (e.g. not yet attached on this client).
	 */
	async resolveChannel(
		client: Client,
		datastoreTag: `datastore-${number}`,
		channelTag: `channel-${number}`,
	): Promise<{ channel: IChannel; datastore: StressDataObject } | undefined> {
		const dsObj = await this.resolveContainerObject(client, datastoreTag);
		if (dsObj?.stressDataObject === undefined) {
			return undefined;
		}

		const channel = await dsObj.stressDataObject.StressDataObject.getChannel(channelTag);
		if (channel === undefined) {
			return undefined;
		}

		return { channel, datastore: dsObj.stressDataObject };
	}

	/**
	 * Selects a channel for an operation using global type-first selection.
	 *
	 * Picks a channel type first from the in-memory registry, then picks a
	 * (datastoreTag, channelTag) of that type, and resolves just that channel
	 * on the given client. Retries with different candidates if the chosen
	 * channel is not yet available on this client.
	 */
	async selectChannelForOperation(client: Client, random: IRandom): Promise<SelectedChannel> {
		const channelTypes = Array.from(this.channelsByType.keys());
		assert(channelTypes.length > 0, "at least one channel type must be registered");
		random.shuffle(channelTypes);

		for (const type of channelTypes) {
			const candidates = [...(this.channelsByType.get(type) ?? [])];
			random.shuffle(candidates);
			for (const candidate of candidates) {
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

		throw new Error("no resolvable channel found across any type");
	}

	private addToTypeIndex(
		channelType: string,
		datastoreTag: `datastore-${number}`,
		channelTag: `channel-${number}`,
	): void {
		const existing = this.channelsByType.get(channelType);
		if (existing !== undefined) {
			existing.push({ datastoreTag, channelTag });
		} else {
			this.channelsByType.set(channelType, [{ datastoreTag, channelTag }]);
		}
	}
}
