/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ISharedCell } from "@prague/cell";

import * as React from "react";
import ContentEditable from "react-simple-contenteditable";

interface p {
    cell: ISharedCell;
    tagName: string;
}

interface s {
    text: string;
}

/**
 * Given a cell will provide an editable component
 * This produces a single line content editable box. It's single line because doing
 * multiple lines means you have to manage line breaks which is hard.
 */
export class CollaborativeContentEditable extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            text: this.props.cell.get(),
        };

        this.handleChange = this.handleChange.bind(this);
    }

    componentWillMount() {
        // Sets an event listener so we can update our state is the value changes
        // Setting the state triggers the render function to get called.
        this.props.cell.on("op", () => {
            this.setState({ text: this.props.cell.get() });
        });
    }

    async handleChange(ev: React.FormEvent<HTMLDivElement>, value: string) {
        this.props.cell.set(value);
    }

    render() {
        // tslint:disable:react-no-dangerous-html
        // TBD - disable dangerously set for actual css
        return(
            <span>
                <style dangerouslySetInnerHTML={{__html: `
                [contenteditable="true"].single-line {
                    white-space: nowrap;
                    overflow: hidden;
                }
                [contenteditable="true"].single-line br {
                    display:none;
                }
                [contenteditable="true"].single-line * {
                    display:inline;
                    white-space:nowrap;
                }
                `}} />
                <ContentEditable
                    html={this.state.text}
                    className={"single-line"}
                    tagName={this.props.tagName}
                    onChange={this.handleChange}
                    contentEditable="plaintext-only"
                    onKeyPress={() => {}}
                />
            </span>
        );
    }
}
