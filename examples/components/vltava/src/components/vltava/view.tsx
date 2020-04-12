/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ILastEditDetails } from "@microsoft/fluid-last-edited";
import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import * as React from "react";

import { LastEditedFacepile } from "../last-edited/facePile";
import { IVltavaUserDetails, IVltavaDataModel } from "./dataModel";
import { VltavaFacepile } from "./facePile";

interface IVltavaViewProps {
    dataModel: IVltavaDataModel;
}

interface IVltavaViewState {
    users: IVltavaUserDetails[];
    view: JSX.Element;
    lastEditedUser: IVltavaUserDetails;
    lastEditedTime: string;
}


export class VltavaView extends React.Component<IVltavaViewProps,IVltavaViewState> {
    constructor(props: IVltavaViewProps) {
        super(props);

        this.state = {
            users: props.dataModel.getUsers(),
            view: <div/>,
            lastEditedUser: { name: "", colorCode: 0 },
            lastEditedTime: "",
        };

        props.dataModel.on("membersChanged", () => {
            const users = props.dataModel.getUsers();
            this.setState({users});
        });
    }

    private setLastEditedState(lastEditDetails: ILastEditDetails) {
        const lastEditedUser = this.props.dataModel.getUser(lastEditDetails.clientId);
        if (lastEditedUser) {
            const date = new Date(lastEditDetails.timestamp);
            const lastEditedTime = date.toUTCString();

            this.setState({
                lastEditedUser,
                lastEditedTime,
            });
        }
    }

    async componentDidMount() {
        const component = await this.props.dataModel.getDefaultComponent();
        this.setState({
            view: <ReactViewAdapter component={component} />,
        });

        const rootComponent = await this.props.dataModel.getRootComponent();
        const lastEditedTracker = rootComponent.IComponentLastEditedTracker?.lastEditedTracker;
        if (lastEditedTracker === undefined) {
            throw new Error("Last edited tracker not found.");
        }

        const details = lastEditedTracker.getLastEditDetails();
        if (details) {
            this.setLastEditedState(details);
        }

        lastEditedTracker.on("lastEditedChanged", (lastEditDetails: ILastEditDetails) => {
            this.setLastEditedState(lastEditDetails);
        });
    }

    render() {
        return (
            <div>
                <div
                    style={{
                        width: "100%",
                        height: "50px",
                        textAlign: "center",
                        borderBottom:"1px solid lightgray",
                        boxSizing:"border-box"}}
                >
                    <div>
                        <h2>
                            {this.props.dataModel.getTitle()}
                        </h2>
                    </div>
                    <VltavaFacepile users={this.state.users}/>
                    <LastEditedFacepile user={this.state.lastEditedUser} time={this.state.lastEditedTime}/>
                </div>
                {this.state.view}
            </div>
        );
    }
}
