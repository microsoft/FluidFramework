/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent, PrimedComponentFactory } from "@microsoft/fluid-aqueduct";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { IComponentUserInformation } from "../interfaces";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const pkg = require("../../package.json");

/**
 * Basic example that takes a container provider
 */
export class ExampleUsingProviders
    extends PrimedComponent<IComponentUserInformation>
    implements IComponentHTMLView
{
    public get IComponentHTMLView() { return this; }

    private userInformation: IComponentUserInformation | undefined;

    public static readonly ComponentName = `${pkg.name as string}-example-using-provider`;

    protected async componentHasInitialized() {
        this.userInformation = await this.providers.IComponentUserInformation;
    }

    // start IComponentHTMLView

    public render(div: HTMLElement) {
        let element: JSX.Element;
        if (this.userInformation){
            const users: JSX.Element[] = [];
            this.userInformation.getUsers().forEach((user)=> {
                users.push(<div>{user}</div>);
            });
            element = (
                <>
                    <h3>Provider Information</h3>
                    <div><b>Count:</b></div>
                    <div>{this.userInformation.userCount}</div>
                    <b>Users:</b>
                    {users}
                </>);
        } else {
            element = (
                <>
                    <h3>Provider Information</h3>
                    <b>NO IComponentUserInformation Provider</b>
                </>);
        }

        ReactDOM.render(
            element,
            div);
    }

    // end IComponentHTMLView

    // ----- COMPONENT SETUP STUFF -----

    public static getFactory() { return ExampleUsingProviders.factory; }

    private static readonly factory = new PrimedComponentFactory(
        ExampleUsingProviders.ComponentName,
        ExampleUsingProviders,
        [SharedMap.getFactory()],
        {IComponentUserInformation},
        {},
    );
}
