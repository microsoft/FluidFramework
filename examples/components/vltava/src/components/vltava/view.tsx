/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import * as React from "react";

import { IVltavaUserDetails, IVltavaDataModel } from "./dataModel";
import { VltavaFacepile } from "./facePile";
import { LastEditedDisplay } from "./lastEditedDisplay";

const viewStyle: React.CSSProperties = {
    width: "100%",
    height: "50px",
    textAlign: "center",
    borderBottom:"1px solid lightgray",
    boxSizing:"border-box",
};

const lastEditedStyle: React.CSSProperties = {
    position: "absolute",
    top: 25,
    right: 20,
    width: 0,
    height: 0,
    borderLeft: "7px solid transparent",
    borderRight: "7px solid transparent",
    borderTop: "7px solid #3B3B3B",
    marginTop: "5px",
    marginLeft: "5px",
    cursor: "pointer",
};

interface IVltavaViewProps {
    dataModel: IVltavaDataModel;
}

interface IVltavaViewState {
    users: IVltavaUserDetails[];
    view: JSX.Element;
    lastEditedUser?: IVltavaUserDetails;
    lastEditedTime?: string;
}

export class VltavaView extends React.Component<IVltavaViewProps,IVltavaViewState> {
    constructor(props: IVltavaViewProps) {
        super(props);

        this.state = {
            users: props.dataModel.getUsers(),
            view: <div/>,
        };

        props.dataModel.on("membersChanged", (users) => {
            this.setState({ users });
        });
    }

    async componentDidMount() {
        const component = await this.props.dataModel.getDefaultComponent();
        this.setState({
            view: <ReactViewAdapter component={component} />,
        });
    }

    private setLastEditedState() {
        const lastEditedUser = this.props.dataModel.getLastEditedUser();
        const lastEditedTime = this.props.dataModel.getLastEditedTime();
        if (lastEditedUser && lastEditedTime) {
            this.setState({
                lastEditedUser,
                lastEditedTime,
            });
        }
    }

    private resetLastEditedState() {
        this.setState({
            lastEditedUser: undefined,
            lastEditedTime: undefined,
        });
    }

    render() {
        return (
            <div>
                <div style = {viewStyle}>
                    <div>
                        <h2>
                            {this.props.dataModel.getTitle()}
                        </h2>
                    </div>
                    <VltavaFacepile users={this.state.users}/>
                </div>
                <div
                    onMouseOver = {() => {
                        this.setLastEditedState();
                    }}
                    onMouseOut = {() => {
                        this.resetLastEditedState();
                    }}>
                    <span style = {lastEditedStyle}></span>
                    <LastEditedDisplay user={this.state.lastEditedUser} time={this.state.lastEditedTime}/>
                </div>
                {this.state.view}
            </div>
        );
    }
}
