import { api } from "@prague/routerlicious";
import * as React from "react";
import { Board, IBoardProps } from "./Board";
import { Control } from "./Control";
import { Logout } from "./Logout";

import prague = api;
import types = prague.types;

export interface IGameState {
  restartVisible: boolean;
  gamePointVisible: boolean;
  player1: IScore;
  player2: IScore;
  draw: number;
}

export interface IScore {
  playerName: string;
  point: number;
}

export class Game extends React.Component<IBoardProps, IGameState> {
    constructor (props: IBoardProps) {
        super(props);
        this.setInitialState();
        this.listenForUpdate();
    }

    render() {
      const player1Point = (this.state.player1) ? (this.state.player1.playerName + ": " + this.state.player1.point) : "";
      const player2Point = (this.state.player2) ? (this.state.player2.playerName + ": " + this.state.player2.point) : "";
      const drawMatches = "Drawn: " + this.state.draw;
      return (
        <div>
          <Logout name={this.props.player.name}/>
          <div className="game-control">
            <div className="game">
              <div className="game-board side-div">
                <Board player={this.props.player} gameMap={this.props.gameMap} gameView={this.props.gameView}/>
              </div>
              {this.state.restartVisible && this.state.gamePointVisible  &&
                <div className="side-div game-points">
                  <div className="point-wrapper">
                    <span className="game-points-text">{player1Point}</span>
                    <span className="game-points-text">{player2Point}</span>
                    <span className="game-points-text">{drawMatches}</span>
                  </div>
                </div>
              }
            </div>
            {this.state.restartVisible &&
              <div className="game-info" onClick={() => this.handleRestart()}>
                <Control restartText="Play Again!"/>
              </div>
            }
          </div>
        </div>
      );
    }

    // For player 1, 'gamePointVisible' and 'player2' will be updated from map update. Just set them to default.
    // For player 2, 'gamePointVisible' is true and 'player2' is already in map. Just get the values.
    private setInitialState() {
      if (this.props.player.id === 1) {
        this.state = {
          restartVisible: false,
          gamePointVisible: false,
          player1: { playerName: this.props.player.name, point: 0 },
          player2: null,
          draw: 0,
        };
      } else if (this.props.player.id === 2) {
        this.state = {
          restartVisible: false,
          gamePointVisible: true,
          player1: { playerName: this.props.gameView.get("pl1"), point: 0 },
          player2: { playerName: this.props.player.name, point: 0 },
          draw: 0,
        };
      }
    }

    private handleRestart() {
      const gameState = this.props.gameView;
      for (const key of gameState.keys()) {
        const parsed = parseInt(key, 10);
        if (!isNaN(parsed)) {
          gameState.delete(key);
        }
      }
      gameState.set("next", this.props.player.id);
      gameState.delete("winner");
      gameState.set("restart", false);
    }

    private listenForUpdate() {
      const stateView = this.props.gameView;
      this.props.gameMap.on("valueChanged", (delta: types.IValueChanged) => {
        // Handles game restart.
        if (delta.key === "restart") {
          const value = stateView.get(delta.key) as boolean;
          if (value) {
            this.setState({
              restartVisible: true,
            });
          } else {
            this.setState({
              restartVisible: false,
            });
          }
        } else if (delta.key === "counter") { // Handles player point visibility.
          const playerCounter = stateView.get("counter") as api.map.Counter;
          this.setState({
            gamePointVisible: playerCounter.value >= 2,
          });
        } else if (delta.key === "pl2") { // For player 1, set player 2 from map update.
            this.setState({
              player2: {
                playerName: stateView.get("pl2") as string,
                point: 0,
              }
            });
        } else if (delta.key === "pl1won" || delta.key === "pl2won" || delta.key === "drawn") { // Update win counter for both players.
          if (delta.key === "pl1won") {
            this.setState({
              player1: {
                playerName: this.state.player1.playerName,
                point: stateView.get("pl1won") as number,
              }
            });
          } else if (delta.key === "pl2won") {
            this.setState({
              player2: {
                playerName: this.state.player2.playerName,
                point: stateView.get("pl2won") as number,
              }
            });
          } else if (delta.key === "drawn") {
            this.setState({
              draw: stateView.get("drawn") as number,
            });
          }
        }
      });
    }
  }