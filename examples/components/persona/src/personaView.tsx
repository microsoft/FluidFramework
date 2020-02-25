/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLOptions, IComponentHTMLView } from "@microsoft/fluid-component-core-interfaces";
import { IDirectory } from "@microsoft/fluid-map";
import { mergeStyles } from "office-ui-fabric-react";
// eslint-disable-next-line import/no-internal-modules
import { Persona, PersonaPresence } from "office-ui-fabric-react/lib/Persona";
import * as React from "react";
import * as ReactDOM from "react-dom";

// Inject some global styles
mergeStyles({
    selectors: {
        ":global(body), :global(html), :global(#app)": {
            margin: 0,
            padding: 0,
            height: "100vh",
        },
    },
});

interface IPersonaReactComponentProps {
    displayName: string;
    jobTitle: string;
    mobilePhone: string;
}

export class PersonaReactComponent extends React.Component<IPersonaReactComponentProps> {
    public render(): JSX.Element {
        return (
            <div className="ms-Grid" dir="ltr">
                <Persona
                    text={this.props.displayName}
                    presence={PersonaPresence.online}
                    secondaryText={this.props.jobTitle}
                    coinSize={150}/>
            </div>
        );
    }
}

export class PersonaView implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    constructor(private readonly directory: IDirectory, public remove: () => void) {
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        ReactDOM.render(
            <PersonaReactComponent
                displayName={this.directory.get("displayName")}
                jobTitle={this.directory.get("jobTitle")}
                mobilePhone={this.directory.get("mobilePhone")}
            />,
            elm);
    }
}
