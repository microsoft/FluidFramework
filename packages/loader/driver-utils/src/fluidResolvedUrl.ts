/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IFluidResolvedUrl } from "@fluidframework/driver-definitions";

export function ensureFluidResolvedUrl(
	resolved: IResolvedUrl | undefined,
): asserts resolved is IFluidResolvedUrl {
	if (resolved?.type !== "fluid") {
		throw new Error(`resolved is not a Fluid url`);
	}
}
