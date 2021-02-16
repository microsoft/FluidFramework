/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IFluidError,
    ITelemetryProperties,
    ISensitiveDebugData,
    isIFluidError,
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

    public addDetails(props: Partial<ITelemetryProperties>, debugData: Partial<ISensitiveDebugData>) {
        this.props = { ...this.props, ...props };
        this.debugData = { ...this.debugData, ...debugData };
    }
}

export class GenericFluidError extends FluidError {
    public errorType: string = "generic";
}

export class ExternalFluidError extends FluidError {
    public errorType: string = "external";

    constructor(err: any) {
        //* start with promoting err's message, per present behavior, and then pull out in later scoped change
        super("External Error");

        this.addDetails({}, { innerError: err });
        if (err.stack !== undefined && err.stack !== "") {
            this.stack = err.stack;
        }
    }
}

export function wrapAsFluidError(err: any): IFluidError {
    if (isIFluidError(err)) {
        return err;
    }

    // WARNING: Exceptions can contain PII!
    // For example, XHR will throw object derived from Error that contains config information
    // for failed request, including all the headers, and thus - user tokens!
    // So wrap external errors to protect against logging too much
    return new ExternalFluidError(err);
}
