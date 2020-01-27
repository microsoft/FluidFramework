/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

import { EmbeddedComponent } from "@microsoft/fluid-aqueduct-react";
import { IVltavaDataModel } from "./dataModel";

interface IVltavaViewProps {
    dataModel: IVltavaDataModel;
}

interface IVltavaViewState {
    view: JSX.Element;
}


export class VltavaView extends React.Component<IVltavaViewProps,IVltavaViewState> {
    constructor(props: IVltavaViewProps) {
        super(props);

        this.state = {
            view: <div/>,
        };
    }

    async componentDidMount() {
        const component = await this.props.dataModel.getDefaultComponent();
        this.setState({
            view: <EmbeddedComponent component={component} />,
        });

    }

    render() {
        return this.state.view;
    }
}
