/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILocalChannel } from "./interfaces";

export class LocalChannel<T> implements ILocalChannel {
	constructor(
		public readonly id: string,
		public readonly type: string,
		public readonly value: T,
	) {}
}

export class LocalDataStructure<T = any> {
	constructor(public readonly type: string, public readonly value: T) {}
}
