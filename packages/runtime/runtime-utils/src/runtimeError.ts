/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidErrorBase, LoggingError, TelemetryDataTag } from "@fluidframework/telemetry-utils";

/**
 * Different error types the Runtime may raise
 */
 export enum RuntimeErrorType {
    /**
     * An error to raise while realizing a channel context
     */
    channelContextRealizeError = "channelContextRealizeError",
}

/**
 * Error raised when a channel context fails to realize
 * Assumed to be a "usage error" where the inputs to the framework are invalid (e.g. incomplete registry)
 */
export interface IChannelContextRealizeError extends IFluidErrorBase {
    errorType: RuntimeErrorType.channelContextRealizeError;
    usageError: true;
}

/**
 * Error raised when a channel context fails to realize
 * Assumed to be a "usage error" where the inputs to the framework are invalid (e.g. incomplete registry)
 */
 export class ChannelContextRealizeError extends LoggingError implements IChannelContextRealizeError {
    public errorType = RuntimeErrorType.channelContextRealizeError;
    public usageError: true = true;

    constructor(
        public fluidErrorCode: string,
        packageName?: string,
    ) {
        super(fluidErrorCode, { packageName: { value: packageName, tag: TelemetryDataTag.PackageData }});
    }
}
