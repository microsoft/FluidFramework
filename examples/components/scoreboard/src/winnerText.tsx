/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedDirectory } from "@microsoft/fluid-map";
import * as React from "react";

interface WinnerTextProps {
    directory: ISharedDirectory;
}

interface WinnerTextState {
    highScore: number;
    teamName: string;
    tied: boolean;
}

export class WinnerText extends React.Component<WinnerTextProps, WinnerTextState> {
    constructor(props: WinnerTextProps) {
        super(props);
        this.state = WinnerText.determineWinner(props.directory);
    }

    // eslint-disable-next-line react/no-deprecated
    componentWillMount() {
    // When any of the values of the directory change, determine the current winner and re-render
        this.props.directory.on("valueChanged", () => {
            this.setState(WinnerText.determineWinner(this.props.directory));
        });
    }

    render() {
        let text: string;
        if (this.state.tied) {
            text = "Tied!";
        } else {
            text = `${this.state.teamName} are winning!`;
        }
        return (
            <div className="box has-text-centered is-size-4">
                {text}
            </div>
        );
    }

    // TODO: This is terrible and should be improved
    private static determineWinner(directory: ISharedDirectory): WinnerTextState {
        let teamName = "None";
        let highScore = 0;
        let tied = true;
        let first = true;
        let initialScore: number;

        directory.forEach(
            (counter, key) => {
                if (first) {
                    initialScore = counter.value;
                    first = false;
                }

                const currentScore: number = counter.value;
                if (currentScore !== initialScore) {
                    tied = false;
                }

                if (currentScore > highScore) {
                    highScore = currentScore;
                    teamName = key;
                }
            });
        return { highScore, teamName, tied };
    }
}
