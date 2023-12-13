/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable, IChannelStorageService } from "@fluidframework/datastore-definitions";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { BlobTreeEntry } from "@fluidframework/driver-utils";
import { IFluidSerializer } from "@fluidframework/shared-object-base";
import { bufferToString } from "@fluid-internal/client-utils";

export const serializeBlob = <T>(
	handle: IFluidHandle,
	path: string,
	snapshot: Serializable<T>,
	serializer: IFluidSerializer,
) => new BlobTreeEntry(path, serializer.stringify(snapshot, handle));

export async function deserializeBlob(
	storage: IChannelStorageService,
	path: string,
	serializer: IFluidSerializer,
) {
	const blob = await storage.readBlob(path);
	const utf8 = bufferToString(blob, "utf8");
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return serializer.parse(utf8);
}
