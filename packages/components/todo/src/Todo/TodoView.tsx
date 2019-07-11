/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedCell } from "@prague/cell";
import { ISharedMap } from "@prague/map";
import * as React from "react";

import { CollaborativeContentEditable } from "../component-lib/collaborativeContentEditable";

interface p {
    createComponent(props?: any): Promise<void>;
    getComponentView(id: string): JSX.Element;
    map: ISharedMap;
    textCell: ISharedCell;
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

        this.createComponent = this.createComponent.bind(this);
        this.handleSubmit = this.handleSubmit.bind(this);
        this.updateInputValue = this.updateInputValue.bind(this);
    }

    componentDidMount(): void {
        this.props.map.on("valueChanged", () => {
            this.setState({ids: [...this.props.map.keys()]});
        });

        // Set focus on the new text input
        this.newTextInput.focus();
    }

    async createComponent(): Promise<void>  {
        await this.props.createComponent({ startingText: this.state.inputValue});
    }

    /**
     * This allows us to prevent default form behavior while getting all the benefits
     */
    async handleSubmit(ev: React.FormEvent<HTMLFormElement>): Promise<void> {
        ev.preventDefault();
        await this.createComponent();
        this.setState({inputValue: ""});
    }

    updateInputValue(ev: React.ChangeEvent<HTMLInputElement>): void {
        this.setState({inputValue: ev.target.value});
    }

    render(): JSX.Element {
        const todoItemComponents = [];
        this.state.ids.forEach((id) => {
            todoItemComponents.push(this.props.getComponentView(id));
        });

        return (
            <div style={{padding: "5px"}}>
                <CollaborativeContentEditable
                    cell={this.props.textCell}
                    tagName="h1"
                />
                <span>
                    <form onSubmit={this.handleSubmit}>
                    <input
                        type="text"
                        value={this.state.inputValue}
                        onChange={this.updateInputValue}
                        ref={(input) => { this.newTextInput = input; }}/>
                    <button type="submit">+</button>
                    </form>
                </span>
                {todoItemComponents}
            </div>
        );
    }
}
