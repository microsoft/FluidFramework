/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IUser } from "@fluidframework/protocol-definitions";
declare module "@fluidframework/core-interfaces" {
    interface IFluidObject extends Readonly<Partial<IProvideFluidLastEditedTracker>> {
    }
}
export declare const IFluidLastEditedTracker: keyof IProvideFluidLastEditedTracker;
export interface IProvideFluidLastEditedTracker {
    readonly IFluidLastEditedTracker: IFluidLastEditedTracker;
}
export interface IFluidLastEditedTracker extends IProvideFluidLastEditedTracker {
    /**
     * Returns the details of the last edit to the container.
     */
    getLastEditDetails(): ILastEditDetails | undefined;
    /**
     * Updates the details of last edit to the container.
     */
    updateLastEditDetails(lastEditDetails: ILastEditDetails): void;
}
export interface ILastEditDetails {
    user: IUser;
    timestamp: number;
}
//# sourceMappingURL=interfaces.d.ts.map