/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";

/**
 * Returns a new IChannelStorageService that resolves the given `path` as root.
 * @internal
 */
export class ObjectStoragePartition implements IChannelStorageService {
	constructor(
		private readonly storage: IChannelStorageService,
		private readonly path: string,
	) {
		// `path` must not include the trailing separator.
		assert(!path.endsWith("/"), 0x19c /* "storage service path has trailing separator" */);
	}

	public async readBlob(path: string): Promise<ArrayBufferLike> {
		return this.storage.readBlob(`${this.path}/${path}`);
	}

	public async contains(path: string): Promise<boolean> {
		return this.storage.contains(`${this.path}/${path}`);
	}

	public async list(path: string): Promise<string[]> {
		return this.storage.list(`${this.path}/${path}`);
	}
}
