/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import { IComponent } from "@microsoft/fluid-component-core-interfaces";

import * as React from "react";

interface IEmbeddedComponentWrapperProps {
    id: string;
    getComponent(id: string): Promise<IComponent>;
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
        const component = await this.props.getComponent(this.props.id);
        const element = <ReactViewAdapter component={component} />;
        this.setState({ element });
    }

    public render() {
        return this.state.element;
    }
}
