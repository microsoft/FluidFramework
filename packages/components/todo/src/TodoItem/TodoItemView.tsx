/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell } from "@prague/cell";
import { Counter } from "@prague/map";
import * as React from "react";

import { TodoItemSupportedComponents } from "./supportedComponent";

import { CollaborativeCheckbox } from "../component-lib/collaborativeCheckbox";
import { CollaborativeContentEditable } from "../component-lib/collaborativeContentEditable";

interface p {
    cell: ISharedCell;
    checkedCounter: Counter;
    id: string;
    innerIdCell: ISharedCell;
    getComponentView(id: string): JSX.Element;
    createComponent(types: TodoItemSupportedComponents, props?: any): Promise<void>;
}

interface s {
    contentVisible: boolean;
    innerId: string;
}

export class TodoItemView extends React.Component<p, s> {
    private readonly baseUrl = `${window.location.origin}/${window.location.pathname.split("/")[1]}`;
    private readonly buttonStyle = {
        height: "25px",
        marginLeft: "2px",
        marginRight: "2px",
        width: "35px",
    };

    constructor(props: p) {
        super(props);

        this.state = {
            contentVisible: false,
            innerId: this.props.innerIdCell.get(),
        };

        this.createComponent = this.createComponent.bind(this);
    }

    async createComponent(type: TodoItemSupportedComponents) {
        await this.props.createComponent(type, { startingText: "Content"});
    }

    componentDidMount() {
        this.props.innerIdCell.on("op", () => {
            this.setState({innerId: this.props.innerIdCell.get()});
        });
    }

    render() {
        // tslint:disable:strict-boolean-expressions
        return (
            <div>
                <h2>
                    <CollaborativeCheckbox
                        counter={this.props.checkedCounter}
                        id={this.props.id}/>
                    <CollaborativeContentEditable
                        cell={this.props.cell}
                        tagName="span"/>
                    <span>
                        <button
                            style={this.buttonStyle}
                            onClick={() => {this.setState({contentVisible: !this.state.contentVisible}); }}>
                            {this.state.contentVisible ? "▲" : "▼"}
                        </button>
                        <button
                            style={this.buttonStyle}
                            onClick={() => window.open(`${this.baseUrl}/${this.props.id}`, "_blank")}>↗</button>
                        <button
                            style={this.buttonStyle}
                            onClick={() => alert("Implement Delete")}>X</button>
                    </span>
                </h2>
                {
                    // If the content is visible we will show a button or a component
                    this.state.contentVisible &&
                    <div style={{paddingLeft: 30}}>
                        {
                            this.state.innerId === "" &&
                            <span>
                                <button onClick={async () => this.createComponent("todo")}>todo</button>
                                <button onClick={async () => this.createComponent("clicker")}>clicker</button>
                            </span>
                        }
                        {this.state.innerId !== "" && this.props.getComponentView(this.state.innerId)}
                    </div>
                }
            </div>
        );
    }
}
