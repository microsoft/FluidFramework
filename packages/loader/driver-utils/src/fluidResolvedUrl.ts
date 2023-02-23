/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IFluidResolvedUrl } from "@fluidframework/driver-definitions";

export const isFluidResolvedUrl = (
	resolved: IResolvedUrl | undefined,
): resolved is IFluidResolvedUrl => resolved?.type === "fluid";

export function ensureFluidResolvedUrl(
	resolved: IResolvedUrl | undefined,
): asserts resolved is IFluidResolvedUrl {
	if (!isFluidResolvedUrl(resolved)) {
		throw new Error(`resolved is not a Fluid url. Type: ${resolved?.type}`);
	}
}
