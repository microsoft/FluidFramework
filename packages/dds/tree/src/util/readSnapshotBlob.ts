/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import type { IChannelStorageService } from "@fluidframework/datastore-definitions/internal";

import type { SummaryElementParser } from "../shared-tree-core/index.js";

import type { JsonCompatible } from "./utils.js";

/**
 * Reads and parses a snapshot blob from storage service.
 */
export const readAndParseSnapshotBlob = async (
	blobPath: string,
	service: IChannelStorageService,
	parse: SummaryElementParser,
): Promise<JsonCompatible<IFluidHandle>> => {
	const treeBuffer = await service.readBlob(blobPath);
	const treeBufferString = bufferToString(treeBuffer, "utf8");
	return parse(treeBufferString) as JsonCompatible<IFluidHandle>;
};
