/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter";
import { IDirectory, SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { Directory } from "./directory";
import { SupportedSharedObjects } from "./loadableDataObject";
import { LocalDataStructure } from "./localDataStructure";

export function fromLocalDataStructure(
	localDataStructure: LocalDataStructure,
	runtime: IFluidDataStoreRuntime,
): SupportedSharedObjects {
	switch (localDataStructure.type) {
		case SharedCounter.getFactory().type: {
			const counter = SharedCounter.create(runtime);
			counter.increment(localDataStructure.value as number);
			return counter;
		}
		case SharedDirectory.getFactory().type: {
			const directory = SharedDirectory.create(runtime);
			populateSharedDirectory(directory, localDataStructure.value as Directory);
			return directory;
		}
		case SharedMap.getFactory().type: {
			const map = SharedMap.create(runtime);
			populateSharedMap(map, localDataStructure.value as Map<string, any>);
			return map;
		}
		case SharedString.getFactory().type: {
			// Note we only support plain text
			const text = SharedString.create(runtime);
			text.insertText(0, localDataStructure.value as string);
			return text;
		}
		default:
			throw new Error("unsupported type");
	}
}

function populateSharedDirectory(sharedDirectory: IDirectory, directory: Directory) {
	for (const [key, value] of directory.entries()) {
		sharedDirectory.set(key, value);
	}
	for (const [key, subDirectory] of directory.subdirectories()) {
		const sharedSubDirectory = sharedDirectory.createSubDirectory(key);
		populateSharedDirectory(sharedSubDirectory, subDirectory);
	}
}

function populateSharedMap(sharedMap: SharedMap, map: Map<string, any>) {
	for (const [key, value] of map.entries()) {
		sharedMap.set(key, value);
	}
}
