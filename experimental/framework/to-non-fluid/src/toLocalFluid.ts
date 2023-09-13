/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISummaryTree, SummaryType } from "@fluidframework/protocol-definitions";
import { ContainerRuntime } from "@fluidframework/container-runtime";
import { assert } from "@fluidframework/core-utils";
import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
} from "@fluidframework/datastore-definitions";
import { LocalChannelStorageService } from "@fluidframework/datastore";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { SharedObject } from "@fluidframework/shared-object-base";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";
import { LocalRuntime } from "./localRuntime";
import { LocalDataStore } from "./localDataStore";
import { ILocalChannel, ISerializableChannel } from "./interfaces";
import { LocalDataStoreRuntime } from "./localDataStoreRuntime";
import { LocalChannelServices } from "./localChannelServices";
import { Directory } from "./directory";
import { LocalChannel, LocalDataStructure } from "./localChannel";
import { LocalSerializer } from "./localSerializer";

export async function toLocalFluid(containerRuntime: ContainerRuntime): Promise<LocalRuntime> {
	const containerSummary: ISummaryTree = containerRuntime.createSummary();
	const lastSequenceNumber = containerRuntime.deltaManager.lastSequenceNumber;
	const localRuntime = new LocalRuntime(lastSequenceNumber);
	console.log(containerSummary);
	await toLocalRuntimeFromTree(containerSummary, localRuntime);
	return localRuntime;
}

async function toLocalRuntimeFromTree(summaryTree: ISummaryTree, localRuntime: LocalRuntime) {
	const channels = summaryTree.tree[".channels"];
	const metadata = summaryTree.tree[".metadata"];
	assert(channels.type === SummaryType.Tree, "should be tree");
	assert(metadata.type === SummaryType.Blob, "should be blob");
	for (const [id, dataStore] of Object.entries(channels.tree)) {
		assert(dataStore.type === SummaryType.Tree, "should be tree");
		const localDataStore = await toLocalDataStoreFromTree(id, dataStore, localRuntime);
		localRuntime.add(localDataStore);
	}
}

async function toLocalDataStoreFromTree(
	dataStoreId: string,
	summaryTree: ISummaryTree,
	localRuntime: LocalRuntime,
): Promise<LocalDataStore> {
	const channels = summaryTree.tree[".channels"];
	const component = summaryTree.tree[".component"];
	assert(channels.type === SummaryType.Tree, "should be tree");
	assert(component.type === SummaryType.Blob, "should be blob");
	assert(typeof component.content === "string", "uint8array parsing not supported");
	const content = JSON.parse(component.content);
	console.log(content);
	assert(typeof content.pkg === "string", "package expected");
	const localDataStore = new LocalDataStore(dataStoreId, content.pkg);
	for (const [id, channel] of Object.entries(channels.tree)) {
		assert(channel.type === SummaryType.Tree, "should be tree");
		const localChannel = await toLocalChannelFromTree(
			id,
			channel,
			localDataStore.localRuntime,
			localRuntime,
		);
		localDataStore.add(localChannel);
	}
	return localDataStore;
}

async function toLocalChannelFromTree(
	id: string,
	summaryTree: ISummaryTree,
	localDataStoreRuntime: LocalDataStoreRuntime,
	localRuntime: LocalRuntime,
): Promise<ILocalChannel> {
	const attributes = summaryTree.tree[".attributes"];
	assert(attributes.type === SummaryType.Blob, "should be blob");
	assert(typeof attributes.content === "string", "uint8array parsing not supported");
	const content = JSON.parse(attributes.content) as IChannelAttributes;
	assert(typeof content.type === "string", "type expected");
	const tree = convertSummaryTreeToITree(summaryTree);
	const localStorageService = new LocalChannelStorageService(tree);
	const localChannelServices = new LocalChannelServices(localStorageService);

	switch (content.type) {
		case SharedDirectory.getFactory().type: {
			const shared = await loadWithSerializer<SharedDirectory>(
				SharedDirectory.getFactory(),
				localRuntime,
				localDataStoreRuntime,
				id,
				localChannelServices,
			);

			const directory = new Directory(id, shared);
			return new LocalChannel<Directory>(id, SharedDirectory.getFactory().type, directory);
		}
		case SharedMap.getFactory().type: {
			const shared = await loadWithSerializer<SharedMap>(
				SharedMap.getFactory(),
				localRuntime,
				localDataStoreRuntime,
				id,
				localChannelServices,
			);

			const map = new Map(shared.entries());
			return new LocalChannel<Map<string, any>>(id, SharedMap.getFactory().type, map);
		}
		case SharedCounter.getFactory().type: {
			const shared = await loadWithSerializer<SharedCounter>(
				SharedCounter.getFactory(),
				localRuntime,
				localDataStoreRuntime,
				id,
				localChannelServices,
			);

			const counter = shared.value;
			return new LocalChannel<number>(id, SharedCounter.getFactory().type, counter);
		}
		case SharedString.getFactory().type: {
			const shared = await loadWithSerializer<SharedString>(
				SharedString.getFactory(),
				localRuntime,
				localDataStoreRuntime,
				id,
				localChannelServices,
			);

			// Note walkSegments is a more complete solution, for now we don't do this.
			const text = shared.getText();
			return new LocalChannel<string>(id, SharedString.getFactory().type, text);
		}
		default:
			throw new Error("unsupported type");
	}
}

export function toLocalChannel(channel: SharedCounter): LocalDataStructure<number>;
export function toLocalChannel(channel: SharedDirectory): LocalDataStructure<Directory>;
export function toLocalChannel(channel: SharedMap): LocalDataStructure<Map<string, any>>;
export function toLocalChannel(channel: SharedString): LocalDataStructure<string>;
export function toLocalChannel(channel: IChannel): LocalDataStructure {
	const type = channel.attributes.type;
	switch (type) {
		case SharedCounter.getFactory().type: {
			const counter = (channel as SharedCounter).value;
			return new LocalDataStructure<number>(type, counter);
		}
		case SharedDirectory.getFactory().type: {
			const directory = new Directory(channel.id, channel as SharedDirectory);
			return new LocalDataStructure<Directory>(type, directory);
		}
		case SharedMap.getFactory().type: {
			const map = new Map((channel as SharedMap).entries());
			return new LocalDataStructure<Map<string, any>>(type, map);
		}
		case SharedString.getFactory().type: {
			// Note walkSegments is a more complete solution, for now we don't do this.
			const text = (channel as SharedString).getText();
			return new LocalDataStructure<string>(type, text);
		}
		default:
			throw new Error("unsupported type");
	}
}

async function loadWithSerializer<T extends SharedObject>(
	factory: IChannelFactory,
	localRuntime: LocalRuntime,
	localDataStoreRuntime: LocalDataStoreRuntime,
	id: string,
	localChannelServices: IChannelServices,
) {
	const channel = factory.create(localDataStoreRuntime, id) as ISerializableChannel;
	channel._serializer = new LocalSerializer(localRuntime);
	await (channel as unknown as SharedObject).load(localChannelServices);
	return channel as unknown as T;
}
