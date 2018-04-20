import { types } from "@prague/routerlicious/dist/client-api";
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
}

export interface IBoardProps {
    gameMap: types.IMap;
    gameView: types.IMapView;
    moves: types.IMap;
    width: number;
    height: number;
    playerId: number;
    playerName: string;
}

export class GameBoard extends React.Component<IBoardProps, IBoardState> {
    constructor(props: IBoardProps) {
        super(props);
        this.setInitialState()
            .then((val) => {

                document.onkeydown = (event: KeyboardEvent) => {
                    const { key } = event;
                    switch (key) {
                        case ("ArrowLeft"):
                        case ("ArrowUp"):
                        case ("ArrowRight"):
                        case ("ArrowDown"): {
                            /*
                                Add the move to the gameView if it's different than the last move
                                draw the
                            */
                            // this.addMove(key, this.props.playerId);
                            console.log("key: " + key);
                            this.props.moves.set("lastMove", key);
                            // this.props.gameView.set(playerSet, );
                            this.setState(this.state);
                            break;
                        }
                        default: {
                            break;
                        }
                    }
                };

                // Check to see if a new player has joined
                this.props.gameMap.on("valueChanged", (message) => {
                    console.log("valueChanged");
                    console.log(message);
                    this.resetState();
                });

                // This seems like it'd mostly be local
                this.props.moves.on("valueChanged", (message) => {
                    console.log("movesValueChanged");
                    console.log(message);
                });

                this.setListeners();
            })
            .catch((err) => {
                console.log(err);
            });
    }

    /*
    * Simplify this rendering...
    */
    public render() {

        if (this.state) {
            return (
                <div>
                    <Logout name={this.props.playerName}/>
                    <a> Rendered Snake </a>
                    <div className="snake-plane">
                        {this.state.player1 !== undefined &&
                            <Body body={this.state.player1.get("lastMove")} name={"player1"}/>}
                        {this.state.player2 !== undefined &&
                            <Body body={this.state.player2.get("lastMove")} name={"player2"}/>}
                        {this.state.player3 !== undefined &&
                            <Body body={this.state.player3.get("lastMove")} name={"player3"}/>}
                        {this.state.player4 !== undefined &&
                            <Body body={this.state.player4.get("lastMove")} name={"player4"}/>}
                    </div>
                </div>
                );
        } else {
            return (
                <div>
                    <Logout name={this.props.playerName}/>
                    <a> Rendered Snake </a>
                    <div className="snake-plane">
                        <h1> No Snakes </h1>
                    </div>
                </div>
                );
        }
    }

    public arrayToBoard(arr: number[]): number[][] {
        const board: number[][] = [];
        for (let i = 0; i < this.props.height; i++) {
            board.push(new Array<number>());
            for (let j = 0; j < this.props.width; j++) {
                board[i].push(0);
            }
        }
        return board;
    }

    private async setInitialState() {
        let player1: types.IMapView;
        let player1Map: types.IMap;
        let player2: types.IMapView;
        let player2Map: types.IMap;
        let player3: types.IMapView;
        let player3Map: types.IMap;
        let player4: types.IMapView;
        let player4Map: types.IMap;

        if (this.props.gameView.has("player1")) {
            player1Map = this.props.gameView.get("player1") as types.IMap;
            player1 = await player1Map.getView();
            player1.set("lastMove", "ArrowLeft");
        }
        if (this.props.gameView.has("player2")) {
            player2Map = this.props.gameView.get("player2") as types.IMap;
            player2 = await player2Map.getView();
            player2.set("lastMove", "ArrowRight");
        }
        if (this.props.gameView.has("player3")) {
            player3Map = this.props.gameView.get("player3") as types.IMap;
            player3 = await player3Map.getView();
            player3.set("lastMove", "ArrowDown");
        }
        if (this.props.gameView.has("player4")) {
            player4Map = this.props.gameView.get("player4") as types.IMap;
            player4 = await player4Map.getView();
            player4.set("lastMove", "ArrowUp");
        }

        this.state = {
            player1,
            player1Map,
            player2,
            player2Map,
            player3,
            player3Map,
            player4,
            player4Map,
        };
        this.setState(this.state);
    }

    private async resetState() {
        let player1: types.IMapView;
        let player1Map: types.IMap;
        let player2: types.IMapView;
        let player2Map: types.IMap;
        let player3: types.IMapView;
        let player3Map: types.IMap;
        let player4: types.IMapView;
        let player4Map: types.IMap;

        if (this.props.gameView.has("player1")) {
            player1Map = this.props.gameView.get("player1") as types.IMap;
            player1 = await player1Map.getView();
            player1.set("lastMove", "ArrowLeft");
        }
        if (this.props.gameView.has("player2")) {
            player2Map = this.props.gameView.get("player2") as types.IMap;
            player2 = await player2Map.getView();
            player2.set("lastMove", "ArrowRight");
        }
        if (this.props.gameView.has("player3")) {
            player3Map = this.props.gameView.get("player3") as types.IMap;
            player3 = await player3Map.getView();
            player3.set("lastMove", "ArrowDown");
        }
        if (this.props.gameView.has("player4")) {
            player4Map = this.props.gameView.get("player4") as types.IMap;
            player4 = await player4Map.getView();
            player4.set("lastMove", "ArrowUp");
        }

        const state = {
            player1,
            player1Map,
            player2,
            player2Map,
            player3,
            player3Map,
            player4,
            player4Map,
        };
        this.setState(state);
        this.setListeners();
    }

    private setListeners() {
        // Monitor the other boards for updates!
        this.state.player1Map.on("valueChanged", (message) => {
            console.log("player1 valueChanged");
            this.setState(this.state);
        });
        this.state.player2Map.on("valueChanged", (message) => {
            console.log("player2 valueChanged");
            this.setState(this.state);
        });
        this.state.player3Map.on("valueChanged", (message) => {
            console.log("player3 valueChanged");
            this.setState(this.state);
        });
        this.state.player4Map.on("valueChanged", (message) => {
            console.log("player4 valueChanged");
            this.setState(this.state);
        });
    }

    /*
                j = \/
        0 1 2 3 4 5 6 7 8 9
    0
    1
    2
    3
i={ 4
    5
    6
    7
    8
    9

    */

}
