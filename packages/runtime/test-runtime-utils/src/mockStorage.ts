/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { stringToBuffer } from "@fluid-internal/client-utils";
import { assert } from "@fluidframework/core-utils";
import { IBlob, ISummaryTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
import { convertSummaryTreeToITree, listBlobsAtTreePath } from "@fluidframework/runtime-utils";

/**
 * Mock implementation of IChannelStorageService based on ITree input.
 * @alpha
 */
export class MockStorage implements IChannelStorageService {
	public static createFromSummary(summaryTree: ISummaryTree) {
		const tree = convertSummaryTreeToITree(summaryTree);
		return new MockStorage(tree);
	}

	private static readBlobCore(tree: ITree | undefined, paths: string[]): IBlob | undefined {
		if (tree) {
			for (const entry of tree.entries) {
				if (entry.path === paths[0]) {
					if (entry.type === "Blob") {
						// eslint-disable-next-line prefer-rest-params
						assert(paths.length === 1, JSON.stringify({ ...arguments }));
						return entry.value;
					}
					if (entry.type === "Tree") {
						return MockStorage.readBlobCore(entry.value, paths.slice(1));
					}
					return undefined;
				}
			}
			return undefined;
		}
	}

	constructor(protected tree?: ITree) {}

	public async readBlob(path: string): Promise<ArrayBufferLike> {
		const blob = MockStorage.readBlobCore(this.tree, path.split("/"));
		assert(blob !== undefined, `Blob does not exist: ${path}`);
		return stringToBuffer(blob.contents, blob.encoding);
	}

	public async contains(path: string): Promise<boolean> {
		return MockStorage.readBlobCore(this.tree, path.split("/")) !== undefined;
	}

	public async list(path: string): Promise<string[]> {
		return listBlobsAtTreePath(this.tree, path);
	}
}
