/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { ILocalChannel } from "./interfaces";
import { LocalRuntime } from "./localRuntime";

export class LocalHandle<T extends ILocalChannel> {
	constructor(private readonly localRuntime: LocalRuntime, public readonly path: string) {}

	public get(): T {
		const parts = this.path.split("/");
		assert(parts.length >= 2, "should at least contain runtime and datastore path");
		assert(parts[0] === "", "runtime should be empty id");
		const localDataStore = this.localRuntime.get(parts[1]);
		if (parts.length === 2) return localDataStore as unknown as T;
		return localDataStore.get(parts[2]) as T;
	}
}
