/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";
import type { JsonCompatible } from "./utils.js";
import { bufferToString } from "@fluid-internal/client-utils";
import type { SummaryElementParser } from "../shared-tree-core/index.js";

/**
 * Reads and parses a snapshot blob from storage service.
 */
export const readAndParseSnapshotBlob = async <T extends JsonCompatible<IFluidHandle>>(
	blobPath: string,
	service: IChannelStorageService,
	parse: SummaryElementParser,
): Promise<T> => {
	const treeBuffer = await service.readBlob(blobPath);
	const treeBufferString = bufferToString(treeBuffer, "utf8");
	return parse(treeBufferString) as T;
};
