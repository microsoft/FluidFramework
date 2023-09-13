/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { LocalDataStructure } from "./localDataStructure";

export class LocalDataObject {
	public readonly dataStructures: Map<string, LocalDataStructure> = new Map();
	public readonly dataObjects: Map<string, LocalDataObject> = new Map();

	constructor(public readonly type: string) {}
}
