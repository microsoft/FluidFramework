/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ReactViewAdapter } from "@microsoft/fluid-view-adapters";
import * as React from "react";

import { IVltavaDataModel } from "./dataModel";
import { VltavaFacepile } from "./facePile";

interface IVltavaViewProps {
    dataModel: IVltavaDataModel;
}

interface IVltavaViewState {
    users: string[];
    view: JSX.Element;
}


export class VltavaView extends React.Component<IVltavaViewProps,IVltavaViewState> {
    constructor(props: IVltavaViewProps) {
        super(props);

        this.state = {
            users: props.dataModel.getUsers(),
            view: <div/>,
        };

        props.dataModel.on("membersChanged", (users) => {
            this.setState({users});
        });
    }

    async componentDidMount() {
        const component = await this.props.dataModel.getDefaultComponent();
        this.setState({
            view: <ReactViewAdapter component={component} />,
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
                </div>
                {this.state.view}
            </div>
        );
    }
}
