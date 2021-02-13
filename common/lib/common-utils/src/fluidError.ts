/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidError,
    ITelemetryProperties,
    ISensitiveDebugData,
    isIFluidError,
    ITelemetryBaseEvent,
} from "@fluidframework/common-definitions";

export abstract class FluidError extends Error implements IFluidError {
    public abstract errorType: string;

    private props: ITelemetryProperties = {};
    private debugData: ISensitiveDebugData = {};
    constructor(
        message: string,
        props: ITelemetryProperties = {},
        debugData: ISensitiveDebugData = {},
    ) {
        super(message);
        this.addDetails(props, debugData);
    }

    public getFluidTelemetryProps() { return { ...this.props, message: this.message, errorType: this.errorType }; }
    public getSensitiveDebugData() {
        return { ...this.debugData, stack: this.stack ?? "" };
    } //* Or implement deep copy? Not even possible...?

    public addDetails(props: ITelemetryProperties, debugData: Partial<ISensitiveDebugData>) {
        this.props = { ...this.props, ...props };
        this.debugData = { ...this.debugData, ...debugData };
    }
}

export class GenericError extends FluidError {
    public errorType: string = "generic";
}

export function wrapAsFluidError(err: any): IFluidError {
    if (isIFluidError(err)) {
        return err;
    }

    // WARNING: Exceptions can contain PII!
    // For example, XHR will throw object derived from Error that contains config information
    // for failed request, including all the headers, and thus - user tokens!
    // Extract only call stack, message, and couple network-related properties form error object

    //* start with promoting err's message, per present behavior, and then pull out in later scoped change.
    //* Same with stack above?
    return new GenericError(
        "External Error",
        {},
        { innerError: err },
    );
}
