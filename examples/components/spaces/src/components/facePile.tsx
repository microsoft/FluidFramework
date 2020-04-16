/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { Persona, PersonaSize } from "office-ui-fabric-react/lib/Persona";
import { Icon } from "office-ui-fabric-react/lib/Icon";

import * as React from "react";
import * as ReactDOM from "react-dom";
import { IQuorum } from "@microsoft/fluid-protocol-definitions";

export const FacePileName = "facepile";
export const FriendlyFacePileName = "Face Pile";

export class FacePile extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(
        FacePileName,
        FacePile,
        [],
        {},
        {});

    public static getFactory() {
        return FacePile.factory;
    }

    /**
     * Will return a new FacePile view
     */
    public render(div: HTMLElement) {
        const quorum = this.context.getQuorum();
        ReactDOM.render(<FacepileAddFaceExample quorum={quorum} />, div);
    }
}

interface IFacepileAddFaceExampleProps {
    quorum: IQuorum;
}

interface IFacepileAddFaceExampleState {
    users: string[];
}

export class FacepileAddFaceExample extends React.Component<IFacepileAddFaceExampleProps,IFacepileAddFaceExampleState> {
    constructor(props: IFacepileAddFaceExampleProps) {
        super(props);
        this.state = {
            users: [...this.props.quorum.getMembers().keys()],
        };
    }

    componentDidMount() {
        this.props.quorum.on("addMember", () => {
            this.setState({
                users: [...this.props.quorum.getMembers().keys()],
            });
        });
        this.props.quorum.on("removeMember", () => {
            this.setState({
                users: [...this.props.quorum.getMembers().keys()],
            });
        });
    }

    public render(): JSX.Element {
        const array: JSX.Element[] = [];
        this.state.users.forEach((value) => {
            array.push(
                <span>
                    <Icon iconName="Contact" />
                    <Persona {...{ text: value }} size={PersonaSize.size8} />
                </span>);
        });

        return (
            <div>
                <h2>Users</h2>
                {array}
            </div>
        );
    }
}
