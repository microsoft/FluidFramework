/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IContainerRuntimeInternal } from "@fluidframework/container-runtime-definitions/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { createServiceAudience } from "@fluidframework/fluid-static/internal";
import type { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { lookupTemporaryBlobStorageId } from "@fluidframework/runtime-utils/internal";

import type {
	IOdspAudience,
	OdspContainerServices as IOdspContainerServices,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";

/**
 * Helper function to build a blob URL from a storage ID using ODSP-specific logic
 * @param storageId - The storage ID of the blob
 * @param resolvedUrl - The ODSP resolved URL containing endpoint information
 * @returns The blob URL if it can be built, undefined otherwise
 */
function buildOdspBlobUrl(
	storageId: string,
	resolvedUrl: IOdspResolvedUrl,
): string | undefined {
	try {
		const attachmentGETUrl = resolvedUrl.endpoints.attachmentGETStorageUrl;
		if (!attachmentGETUrl) {
			return undefined;
		}
		return `${attachmentGETUrl}/${encodeURIComponent(storageId)}/content`;
	} catch {
		return undefined;
	}
}

/**
 * Helper function for ODSPClient to lookup blob URLs
 * @param runtimeInternal - The container runtime internal interface
 * @param handle - The blob handle to lookup the URL for
 * @param resolvedUrl - The ODSP resolved URL containing endpoint information
 * @returns The blob URL if found and the blob is not pending, undefined otherwise
 */
function lookupOdspBlobURL(
	runtimeInternal: IContainerRuntimeInternal,
	handle: IFluidHandle,
	resolvedUrl: IOdspResolvedUrl,
): string | undefined {
	try {
		if (
			runtimeInternal !== undefined &&
			typeof (runtimeInternal as { lookupTemporaryBlobStorageId?: unknown })
				.lookupTemporaryBlobStorageId === "function"
		) {
			// Get the storage ID from the runtime
			const storageId = lookupTemporaryBlobStorageId(runtimeInternal, handle);
			if (storageId === undefined) {
				return undefined;
			}

			// Build the URL using ODSP-specific logic
			return buildOdspBlobUrl(storageId, resolvedUrl);
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * @internal
 */
export class OdspContainerServices implements IOdspContainerServices {
	public readonly audience: IOdspAudience;

	public constructor(
		container: IContainer,
		private readonly odspResolvedUrl?: IOdspResolvedUrl,
		private readonly containerRuntimeInternal?: IContainerRuntimeInternal,
	) {
		this.audience = createServiceAudience({
			container,
			createServiceMember: createOdspAudienceMember,
		});
	}

	public lookupTemporaryBlobURL(handle: IFluidHandle): string | undefined {
		if (!this.odspResolvedUrl || this.containerRuntimeInternal === undefined) {
			// Can't build URLs without ODSP resolved URL information
			return undefined;
		}
		return lookupOdspBlobURL(this.containerRuntimeInternal, handle, this.odspResolvedUrl);
	}
}
