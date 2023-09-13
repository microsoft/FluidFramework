/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedCounter } from "@fluidframework/counter";
import { SharedString } from "@fluidframework/sequence";
import { Directory } from "./directory";
import { LocalDataStructure } from "./localDataStructure";

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
