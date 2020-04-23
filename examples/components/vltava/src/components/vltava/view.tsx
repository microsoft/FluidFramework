/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import * as React from "react";

import { IVltavaDataModel, IVltavaLastEditedState, IVltavaUserDetails } from "./dataModel";
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
                <div style = {viewStyle}>
                    <div>
                        <h2>
                            {this.props.dataModel.getTitle()}
                        </h2>
                    </div>
                    <VltavaFacepile users={this.state.users}/>
                </div>
                <div
                    style = {lastEditedStyle}
                    onMouseOver = { this.setLastEditedState.bind(this) }
                    onMouseOut = { this.resetLastEditedState.bind(this) }>
                    <LastEditedDisplay lastEditedState={this.state.lastEditedState}/>
                </div>
                {this.state.view}
            </div>
        );
    }
}
