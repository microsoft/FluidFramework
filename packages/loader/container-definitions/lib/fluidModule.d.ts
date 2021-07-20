/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidObject, IProvideFluidCodeDetailsComparer } from "@fluidframework/core-interfaces";
export interface IFluidModule {
    fluidExport: IFluidObject & Partial<Readonly<IProvideFluidCodeDetailsComparer>>;
}
//# sourceMappingURL=fluidModule.d.ts.map