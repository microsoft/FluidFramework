/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { TextMatch } from "./textMatch";

interface IProps {
    username: string;
    medal: string;
    getWPM(): string;
    getText(): string;
    textMatch: TextMatch;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IState { }

export class OtherTextView extends React.Component<IProps, IState> {
    public render() {
        const text = this.props.getText() || "";
        const match = this.props.textMatch.match(text);

        return (
            <div style={{ border: "1px solid black" }}>
                <div style={{ background: "lightgray" }}>
                    <b>{this.props.username} ({this.props.getWPM()} wpm) {this.props.medal}</b><br />
                </div>
                <p>
                    <span>{match.correctText}</span>
                    <span style={{ color: "red" }}>{match.badText}</span>
                </p>
            </div>
        );
    }
}
