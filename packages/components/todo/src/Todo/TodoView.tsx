/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CollaborativeInput } from "@microsoft/fluid-aqueduct-react";
import { ISharedMap } from "@microsoft/fluid-map";
import { SharedString } from "@microsoft/fluid-sequence";
import * as React from "react";

interface p {
    createTodoItemComponent(props?: any): Promise<void>;
    createComponentView(id: string): JSX.Element;
    map: ISharedMap;
    textSharedString: SharedString;
}

interface s {
    ids: string[];
    inputValue: string;
}

// tslint:disable:react-a11y-input-elements
export class TodoView extends React.Component<p, s> {
    private newTextInput: HTMLInputElement;
    constructor(props: p) {
        super(props);

        this.state = {
            ids: [...this.props.map.keys()],
            inputValue: "",
        };

        this.handleSubmit = this.handleSubmit.bind(this);
        this.updateInputValue = this.updateInputValue.bind(this);
    }

    componentDidMount(): void {
        this.props.map.on("op", () => {
            this.setState({ids: [...this.props.map.keys()]});
        });

        // Set focus on the new text input
        this.newTextInput.focus();
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    async handleSubmit(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.props.createTodoItemComponent({ startingText: this.state.inputValue});
        this.setState({inputValue: ""});
    }

    updateInputValue(ev: React.ChangeEvent<HTMLInputElement>): void {
        this.setState({inputValue: ev.target.value});
    }

    render(): JSX.Element {
        const todoItemComponents = [];
        this.state.ids.forEach((id) => {
            todoItemComponents.push(this.props.createComponentView(id));
        });

        return (
            <div className="todoView">
                <CollaborativeInput
                    sharedString={this.props.textSharedString}
                    style={{
                        border: "none",
                        fontFamily: "inherit",
                        fontSize: 30,
                        marginBottom: 5,
                        marginTop: 5,
                        outline: "none",
                        width: "inherit",
                    }}
                />
                <form onSubmit={this.handleSubmit}>
                    <input
                        type="text"
                        value={this.state.inputValue}
                        onChange={this.updateInputValue}
                        ref={(input) => { this.newTextInput = input; }}/>
                    <button type="submit">+</button>
                </form>
                <div className="todoItemList">
                    {todoItemComponents}
                </div>
            </div>
        );
    }
}
