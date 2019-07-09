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
 * Given a map (should be shared string) will provide an editable component
 */
export class FluidContentEditable extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            text: this.props.cell.get(),
        };

        this.handleChange = this.handleChange.bind(this);
    }

    componentDidMount() {
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
