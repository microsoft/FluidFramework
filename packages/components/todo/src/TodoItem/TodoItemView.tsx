/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeCheckbox, CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { ISharedCell } from "@microsoft/fluid-cell";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";
import { TodoItemSupportedComponents } from "./supportedComponent";

interface p {
    sharedString: SharedString;
    checked: boolean;
    id: string;
    innerIdCell: ISharedCell;
    handleCheckedChange(newState: boolean): void;
    getComponentView(id: string): JSX.Element;
    createInnerComponent(types: TodoItemSupportedComponents, props?: any): Promise<void>;
}

interface s {
    contentVisible: boolean;
    innerId: string;
}

export class TodoItemView extends React.Component<p, s> {
    private readonly baseUrl = `${window.location.origin}`;
    private readonly buttonStyle = {
        height: "25px",
        marginLeft: "2px",
        marginRight: "2px",
        width: "35px",
    };

    constructor(props: p) {
        super(props);

        const pathName = window.location.pathname.split("/");
        const path: string[] = [];
        for (const val of pathName) {
            if (!val.startsWith("item")) {
                path.push(val);
            }
        }
        this.baseUrl += `${path.join("/")}${window.location.search}`;
        this.state = {
            contentVisible: false,
            innerId: this.props.innerIdCell.get(),
        };

        this.createInnerComponent = this.createInnerComponent.bind(this);
        this.handleCheckedChange = this.handleCheckedChange.bind(this);
    }

    async createInnerComponent(type: TodoItemSupportedComponents) {
        await this.props.createInnerComponent(type, { startingText: type});
    }

    componentDidMount() {
        this.props.innerIdCell.on("op", () => {
            this.setState({innerId: this.props.innerIdCell.get()});
        });
    }

    private handleCheckedChange(newState: boolean): void {
        this.props.handleCheckedChange(newState);
        this.forceUpdate();
    }

    render() {
        // tslint:disable:strict-boolean-expressions
        return (
            <div className="todoItem">
                <h2>
                    <CollaborativeCheckbox
                        checked={this.props.checked}
                        onCheckedChange={this.handleCheckedChange}
                        id={this.props.id}/>
                    <CollaborativeInput
                        sharedString={this.props.sharedString}
                        style={{
                            border: "none",
                            fontFamily: "inherit",
                            fontSize: 20,
                            marginBottom: 5,
                            marginTop: 5,
                            outline: "none",
                            width: "inherit",
                        }}/>
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
                </h2>
                {
                    // If the content is visible we will show a button or a component
                    this.state.contentVisible &&
                    <div className="todoItemDetails">
                        {
                            this.state.innerId === "" ?
                            <>
                                <button onClick={async () => this.createInnerComponent("todo")}>todo</button>
                                <button onClick={async () => this.createInnerComponent("clicker")}>clicker</button>
                                <button onClick={async () => this.createInnerComponent("textBox")}>textBox</button>
                                <button onClick={async () => this.createInnerComponent("textList")}>textList</button>
                            </> :
                            this.props.getComponentView(this.state.innerId)
                        }
                    </div>
                }
            </div>
        );
    }
}
