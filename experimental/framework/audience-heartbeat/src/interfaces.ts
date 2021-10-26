/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IProvideFluidAudienceWithHeartBeat {
    readonly IFluidAudienceWithHeartBeat: IFluidAudienceWithHeartBeat;
}

export interface IFluidAudienceWithHeartBeat extends IProvideFluidAudienceWithHeartBeat {
    /**
     * enables heartbeats via signals.
     */
    enableHeartBeat();

    /**
     * disable heartbeats.
     */
    disableHeartBeat();
}
