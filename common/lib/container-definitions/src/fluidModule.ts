/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidObject, IProvideFluidCodeDetailsComparer } from "@fluidframework/core-interfaces";

export interface IFluidModule {
    fluidExport: IFluidObject & Partial<Readonly<IProvideFluidCodeDetailsComparer>>;
}
