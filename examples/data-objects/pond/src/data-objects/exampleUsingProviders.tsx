/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import React from "react";
import ReactDOM from "react-dom";
import { IFluidUserInformation } from "../interfaces";
/**
 * Basic example that takes a container provider
 */
export class ExampleUsingProviders
    extends DataObject<{OptionalProviders: IFluidUserInformation}>
    implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private userInformation: IFluidUserInformation | undefined;

    public static readonly ComponentName = `@fluid-example/pond-example-using-provider`;

    protected async hasInitialized() {
        this.userInformation = await this.providers.IFluidUserInformation;
    }

    // start IFluidHTMLView

    public render(div: HTMLElement) {
        let element: JSX.Element = <span></span>;
        if (this.userInformation !== undefined) {
            element = <ExampleUsingProvidersView userInfo={this.userInformation} />;
        } else {
            console.log("No IFluidUserInformation Provided");
        }

        ReactDOM.render(
            element,
            div);
    }

    // end IFluidHTMLView

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return ExampleUsingProviders.factory; }

    private static readonly factory =
        new DataObjectFactory(
            ExampleUsingProviders.ComponentName,
            ExampleUsingProviders,
            [SharedMap.getFactory()],
            { IFluidUserInformation });
}

interface ExampleUsingProvidersViewProps {
    readonly userInfo: IFluidUserInformation;
}

interface ExampleUsingProvidersViewState {
    readonly count: number;
    readonly users: string[];
}

class ExampleUsingProvidersView
    extends React.Component<ExampleUsingProvidersViewProps, ExampleUsingProvidersViewState>
{
    constructor(props: ExampleUsingProvidersViewProps) {
        super(props);

        this.state = {
            count: this.props.userInfo.userCount,
            users: this.props.userInfo.getUsers(),
        };

        this.props.userInfo.on("membersChanged", () => this.setState(
            {
                count: this.props.userInfo.userCount,
                users: this.props.userInfo.getUsers(),
            },
        ));
    }

    public render() {
        const users: JSX.Element[] = [];
        this.state.users.forEach((user) => {
            users.push(<div>{user}</div>);
        });
        return (
            <div style={{ border: "1px dotted green" }}>
                <h3>Provider Information</h3>
                <div><b>Count:</b></div>
                <div>{this.state.count}</div>
                <b>Users:</b>
                {users}
            </div>);
    }
}
