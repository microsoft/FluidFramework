/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ILocalChannel } from "./interfaces";
import { LocalDataStoreRuntime } from "./localDataStoreRuntime";
import { LocalDataStructure } from "./localChannel";

export class LocalDataStore implements ILocalChannel {
	public readonly channels: Map<string, ILocalChannel> = new Map();
	public readonly localRuntime: LocalDataStoreRuntime;

	constructor(public readonly id: string, public readonly type: string) {
		this.localRuntime = new LocalDataStoreRuntime(`/${id}`, id);
	}

	public add(channel: ILocalChannel) {
		assert(!this.channels.has(channel.id), "channel already exists!");
		this.channels.set(channel.id, channel);
	}

	public get(id: string): ILocalChannel {
		const channel = this.channels.get(id);
		assert(channel !== undefined, "channel should exist");
		return channel;
	}
}

export class LocalDataObject {
	public readonly dataStructures: Map<string, LocalDataStructure> = new Map();
	public readonly dataObjects: Map<string, LocalDataObject> = new Map();

	constructor(public readonly type: string) {}
}
