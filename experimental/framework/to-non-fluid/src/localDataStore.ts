/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { DataStructure, LocalDataStructure } from "./localDataStructure";
import { LocalHandle } from "./localHandle";

export class LocalDataObject {
	public readonly dataStructures: Map<string, LocalDataStructure> = new Map();
	public readonly dataObjects: Map<string, LocalDataObject> = new Map();
	public readonly handles: Map<string, LocalHandle> = new Map();

	constructor(public readonly type: string) {}

	public getDataStructure<T extends DataStructure>(key: string): LocalDataStructure<T> {
		const val = this.dataStructures.get(key);
		assert(val !== undefined, "should have data structure");
		return val as LocalDataStructure<T>;
	}

	public getLocalDataObject(key: string): LocalDataObject {
		const val = this.dataObjects.get(key);
		assert(val !== undefined, "should have data object");
		return val;
	}
}
