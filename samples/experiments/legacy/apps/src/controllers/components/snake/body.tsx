/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { map, types } from "@prague/routerlicious/dist/client-api";
import * as React from "react";

export interface ISnakeState {
    turn: number;
}

export interface ISnakeProps {
    name: string;
    playerMap: types.IMap;
    gameCounter: map.Counter;
}

export class Body extends React.Component<ISnakeProps, ISnakeState> {
    private playerView: types.IMapView;
    private start: number;
    constructor(props: ISnakeProps) {
        super(props);
        this.props.playerMap.getView().
            then((view) => {
                this.playerView = view;

                console.log("Building Body Name: " + this.props.name +
                            " Last Move: " + this.props.playerMap.get("lastMove"));

                this.props.playerMap.on("valueChanged", async (delta: types.IValueChanged) => {

                    if (delta.key === "playerStart") {
                        this.start = await this.props.playerMap.get<number>("playerStart");

                    } else if (delta.key === "gameCounter") {
                        if (this.start === undefined && this.playerView.has("playerStart")) {
                            this.start = this.playerView.get("playerStart");
                        }

                        if (this.start !== undefined) {
                            const turnTime = this.playerView.get("gameCounter") - this.start;
                            console.log(turnTime);
                            this.setState({
                                turn: turnTime,
                            });
                        }
                    } else if (delta.key === "lastMove") {
                        console.log("ValueChanged " + this.props.name + "key: " +
                            delta.key +  "value: " + this.playerView.get(delta.key));
                    } else {
                        console.log("ValueChanged " + this.props.name + "key: " +
                            delta.key +  "value: " + this.playerView.get(delta.key));
                    }
                });
            })
            .catch((err) => {
                console.log(err);
            });
    }

    public render() {
        if (this.playerView) {
            return (
                <h1> {this.props.name}: {this.playerView.get("lastMove")}: {this.state.turn} </h1>
            );
        } else {
            return (<h1> {this.props.name}: Player Not Yet Created </h1>);
        }

    }
}
