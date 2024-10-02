/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import { IBlob, ITree, TreeEntry } from "@fluidframework/driver-definitions/internal";
import { listBlobsAtTreePath } from "@fluidframework/runtime-utils/internal";

export class LocalChannelStorageService implements IChannelStorageService {
	constructor(private readonly tree: ITree) {}

	public async readBlob(path: string): Promise<ArrayBufferLike> {
		const blob = this.readBlobSync(path);
		if (blob === undefined) {
			throw new Error("Blob Not Found");
		}
		return stringToBuffer(blob.contents, blob.encoding);
	}

	public async contains(path: string): Promise<boolean> {
		const blob = this.readBlobSync(path);
		return blob !== undefined ? blob.contents !== undefined : false;
	}

	public async list(path: string): Promise<string[]> {
		return listBlobsAtTreePath(this.tree, path);
	}

	private readBlobSync(path: string): IBlob | undefined {
		return this.readBlobSyncInternal(path, this.tree);
	}

	private readBlobSyncInternal(path: string, tree: ITree): IBlob | undefined {
		for (const entry of tree.entries) {
			switch (entry.type) {
				case TreeEntry.Blob:
					if (path === entry.path) {
						return entry.value;
					}
					break;

				case TreeEntry.Tree:
					if (path.startsWith(entry.path)) {
						return this.readBlobSyncInternal(path.substr(entry.path.length + 1), entry.value);
					}
					break;

				default:
			}
		}

		return undefined;
	}
}
