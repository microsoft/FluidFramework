/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IFluidResolvedUrl } from "@fluidframework/driver-definitions";

/**
 * @deprecated In the next major release all IResolvedUrl will be IFluidResolvedUrl,
 * so this method is no longer necessary.
 */
export const isFluidResolvedUrl = (
	resolved: IResolvedUrl | undefined,
): resolved is IFluidResolvedUrl => resolved?.type === "fluid";

/**
 * @deprecated In the next major release all IResolvedUrl will be IFluidResolvedUrl,
 * so this method is no longer necessary.
 */
export function ensureFluidResolvedUrl(
	resolved: IResolvedUrl | undefined,
): asserts resolved is IFluidResolvedUrl {
	if (!isFluidResolvedUrl(resolved)) {
		throw new Error(`resolved is not a Fluid url. Type: ${resolved?.type}`);
	}
}
