/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@fluidframework/view-adapters";
import React from "react";

import { IVltavaDataModel, IVltavaLastEditedState, IVltavaUserDetails } from "./dataModel";
import { VltavaFacepile } from "./facePile";
import { LastEditedDisplay } from "./lastEditedDisplay";

const viewStyle: React.CSSProperties = {
    width: "100%",
    height: 50,
    textAlign: "center",
    borderBottom: "1px solid lightgray",
    boxSizing: "border-box",
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
    zIndex: 20,
};

interface IVltavaViewProps {
    dataModel: IVltavaDataModel;
}

interface IVltavaViewState {
    users: IVltavaUserDetails[];
    view: JSX.Element;
    lastEditedState?: IVltavaLastEditedState;
}

export class VltavaView extends React.Component<IVltavaViewProps, IVltavaViewState> {
    constructor(props: IVltavaViewProps) {
        super(props);

        this.state = {
            users: props.dataModel.getUsers(),
            view: <div />,
        };

        props.dataModel.on("membersChanged", (users) => {
            this.setState({ users });
        });
    }

    async componentDidMount() {
        const fluidObject = await this.props.dataModel.getDefaultFluidObject();
        this.setState({
            view: <ReactViewAdapter view={fluidObject} />,
        });
    }

    private setLastEditedState() {
        this.props.dataModel.getLastEditedState()
            .then((lastEditedState) => {
                this.setState({ lastEditedState });
            })
            .catch((error) => {
                throw new Error(error);
            });
    }

    private resetLastEditedState() {
        this.setState({ lastEditedState: undefined });
    }

    render() {
        return (
            <div>
                <div style={viewStyle}>
                    <div>
                        <h2>
                            Vltava
                        </h2>
                    </div>
                    <VltavaFacepile users={this.state.users} />
                    <div
                        style={lastEditedStyle}
                        onMouseOver={this.setLastEditedState.bind(this)}
                        onMouseOut={this.resetLastEditedState.bind(this)}>
                        <LastEditedDisplay lastEditedState={this.state.lastEditedState} />
                    </div>
                </div>
                {this.state.view}
            </div>
        );
    }
}
