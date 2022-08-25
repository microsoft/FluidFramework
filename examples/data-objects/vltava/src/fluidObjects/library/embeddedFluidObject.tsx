/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@fluidframework/view-adapters";
import { FluidObject } from "@fluidframework/core-interfaces";

import React from "react";

interface IEmbeddedFluidObjectWrapperProps {
    getFluidObject(): Promise<FluidObject | undefined>;
}

interface IEmbeddedFluidObjectWrapperState {
    element: JSX.Element;
}

/**
 * This wrapper handles the async-ness of loading a Fluid object.
 * This ideally shouldn't be here but is here for now to unblock me not knowing how to use ReactViewAdapter.
 */
export class EmbeddedFluidObjectWrapper
    extends React.Component<IEmbeddedFluidObjectWrapperProps, IEmbeddedFluidObjectWrapperState> {
    constructor(props: IEmbeddedFluidObjectWrapperProps) {
        super(props);
        this.state = {
            element: <span></span>,
        };
    }

    async componentDidMount() {
        const fluidObject = await this.props.getFluidObject();
        if (fluidObject) {
            const element = <ReactViewAdapter view={fluidObject} />;
            this.setState({ element });
        }
    }

    public render() {
        return this.state.element;
    }
}
