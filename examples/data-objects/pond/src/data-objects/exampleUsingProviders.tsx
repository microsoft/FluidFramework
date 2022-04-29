/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DataObject,
    DataObjectFactory,
} from "@fluidframework/aqueduct";
import { SharedMap } from "@fluidframework/map";
import React from "react";
import { IFluidUserInformation } from "../interfaces";
/**
 * Basic example that takes a container provider
 */
export class ExampleUsingProviders extends DataObject<{ OptionalProviders: IFluidUserInformation }> {
    private _userInformation: IFluidUserInformation | undefined;
    public get userInformation(): IFluidUserInformation {
        if (this._userInformation === undefined) {
            throw new Error("User information accessed before initialized");
        }
        return this._userInformation;
    }

    public static readonly ComponentName = `@fluid-example/pond-example-using-provider`;

    protected async hasInitialized() {
        this._userInformation = await this.providers.IFluidUserInformation;
    }

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return ExampleUsingProviders.factory; }

    private static readonly factory =
        new DataObjectFactory(
            ExampleUsingProviders.ComponentName,
            ExampleUsingProviders,
            [SharedMap.getFactory()],
            { IFluidUserInformation });
}

export interface ExampleUsingProvidersViewProps {
    readonly userInfo: IFluidUserInformation;
}

interface ExampleUsingProvidersViewState {
    readonly count: number;
    readonly users: string[];
}

export class ExampleUsingProvidersView
    extends React.Component<ExampleUsingProvidersViewProps, ExampleUsingProvidersViewState> {
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
