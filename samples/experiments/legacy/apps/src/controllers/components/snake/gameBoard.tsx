/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { map, types } from "@prague/routerlicious/dist/client-api";
import * as React from "react";
import { Logout } from "../Logout";
import { Body } from "./body";

export interface IBoardState {
    player1: types.IMapView;
    player1Map: types.IMap;
    player2: types.IMapView;
    player2Map: types.IMap;
    player3: types.IMapView;
    player3Map: types.IMap;
    player4: types.IMapView;
    player4Map: types.IMap;
    gameCounter: map.Counter;
}

export interface IBoardProps {
    gameMap: types.IMap;
    gameView: types.IMapView;
    moves: types.IMapView;
    width: number;
    height: number;
    playerId: number;
    playerName: string;
}

export class GameBoard extends React.Component<IBoardProps, {}> {
    constructor(props: IBoardProps) {
        super(props);
        document.onkeydown = (event: KeyboardEvent) => {
            const { key } = event;
            switch (key) {
                case ("ArrowLeft"):
                case ("ArrowUp"):
                case ("ArrowRight"):
                case ("ArrowDown"): {
                    if (this.props.moves.get("lastMove") !== key) {
                        console.log("New Key");
                    }
                    this.props.moves.set("lastMove", key);

                    break;
                }
                default: {
                    break;
                }
            }
        };
    }

    public render() {
        console.log("RENDERING!RENDERING!RENDERING!RENDERING");

        return (
        <div>
            <Logout name={this.props.playerName}/>
            <a> Rendered Snake </a>
            <div className="snake-plane">
                <Body
                    name={"player1"}
                    gameCounter={this.props.gameView.get("gameCounter")}
                    playerMap={this.props.gameView.get("player1") as types.IMap}/>
                <Body
                    name={"player2"}
                    gameCounter={this.props.gameView.get("gameCounter")}
                    playerMap={this.props.gameView.get("player2") as types.IMap}/>
                <Body
                    name={"player3"}
                    gameCounter={this.props.gameView.get("gameCounter")}
                    playerMap={this.props.gameView.get("player3") as types.IMap}/>
                <Body
                    name={"player4"}
                    gameCounter={this.props.gameView.get("gameCounter")}
                    playerMap={this.props.gameView.get("player4") as types.IMap}/>
            </div>
        </div>
        );
    }
}
