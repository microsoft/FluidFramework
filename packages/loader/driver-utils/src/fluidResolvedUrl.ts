/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl, IFluidResolvedUrl } from "@microsoft/fluid-driver-definitions";

export const isFluidResolvedUrl =
    (resolved: IResolvedUrl | undefined): resolved is IFluidResolvedUrl => resolved?.type === "fluid";

export function ensureFluidResolvedUrl(resolved: IResolvedUrl | undefined): asserts resolved is IFluidResolvedUrl{
    if (!isFluidResolvedUrl(resolved)) {
        throw new Error(`resolved is not a fluid url. Type: ${resolved?.type}`);
    }
}
