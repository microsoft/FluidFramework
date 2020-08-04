/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@fluidframework/view-adapters";
import { IFluidObject } from "@fluidframework/component-core-interfaces";

import React from "react";

interface IEmbeddedComponentWrapperProps {
    id: string;
    requestFluidObject(id: string): Promise<IFluidObject | undefined>;
}

interface IEmbeddedComponentWrapperState {
    element: JSX.Element;
}

/**
 * This wrapper handles the async-ness of loading a component.
 * This ideally shouldn't be here but is here for now to unblock me not knowing how to use ReactViewAdapter.
 */
export class EmbeddedComponentWrapper
    extends React.Component<IEmbeddedComponentWrapperProps, IEmbeddedComponentWrapperState>
{
    constructor(props: IEmbeddedComponentWrapperProps) {
        super(props);
        this.state = {
            element: <span></span>,
        };
    }

    async componentDidMount() {
        const component = await this.props.requestFluidObject(this.props.id);
        if (component) {
            const element = <ReactViewAdapter view={component} />;
            this.setState({ element });
        }
    }

    public render() {
        return this.state.element;
    }
}
