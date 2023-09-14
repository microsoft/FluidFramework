/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Directory } from "./directory";
import { LocalDataObject } from "./localDataStore";
import { LocalDataStructure } from "./localDataStructure";

export interface ISerializableDirectory {
	map: Record<string, any>;
	subDirectories: Record<string, ISerializableDirectory>;
}

export type SerializableStructure = string | number | Record<string, any> | ISerializableDirectory;

export interface ISerializableDataStructure {
	type: string;
	value: SerializableStructure;
}

export interface ISerializableDataObject {
	type: string;
	dataObjects: Record<string, ISerializableDataObject>;
	dataStructures: Record<string, ISerializableDataStructure>;
}

function makeSerializableMap(map: Map<string, any>): Record<string, any> {
	const newObject: Record<string, any> = {};
	for (const [key, value] of map) {
		newObject[key] = value;
	}
	return newObject;
}

function makeSerializableDirectory(directory: Directory): ISerializableDirectory {
	const subDirectories: Record<string, ISerializableDirectory> = {};
	for (const [key, value] of directory.subdirectories()) {
		subDirectories[key] = makeSerializableDirectory(value);
	}

	const serializableDirectory: ISerializableDirectory = {
		map: makeSerializableMap(directory),
		subDirectories,
	};

	return serializableDirectory;
}

function makeSerializableDataStructure(
	localDataStructure: LocalDataStructure,
): ISerializableDataStructure {
	const value = localDataStructure.value;
	let serializableValue;
	if (value instanceof Map) {
		serializableValue = makeSerializableMap(value);
	} else if (value instanceof Directory) {
		serializableValue = makeSerializableDirectory(value);
	} else {
		serializableValue = value;
	}

	const serializableDataStructure: ISerializableDataStructure = {
		type: localDataStructure.type,
		value: serializableValue,
	};

	return serializableDataStructure;
}

export function makeSerializableDataObject(
	localDataObject: LocalDataObject,
): ISerializableDataObject {
	const serializableDataStructures: Record<string, ISerializableDataStructure> = {};
	for (const [key, value] of localDataObject.dataStructures) {
		serializableDataStructures[key] = makeSerializableDataStructure(value);
	}

	const serializableDataObjects: Record<string, ISerializableDataObject> = {};
	for (const [key, value] of localDataObject.dataObjects) {
		serializableDataObjects[key] = makeSerializableDataObject(value);
	}

	const serializable: ISerializableDataObject = {
		type: localDataObject.type,
		dataObjects: serializableDataObjects,
		dataStructures: serializableDataStructures,
	};

	return serializable;
}
