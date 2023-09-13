/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export class LocalDataStructure<T = any> {
	constructor(public readonly type: string, public readonly value: T) {}
}
