/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Directory } from "./directory";

export type DataStructure = string | number | Map<string, any> | Directory;

export class LocalDataStructure<T = DataStructure> {
	constructor(public readonly type: string, public readonly value: T) {}
}
