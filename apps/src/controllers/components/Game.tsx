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
}

export interface IScore {
  playerName: string;
  point: number;
}

export class Game extends React.Component<IBoardProps, IGameState> {
    constructor (props: IBoardProps) {
        super(props);
        this.setInitialState();
        this.listenForRestart();
    }

    render() {
      let restartClassName = "game-info" + (!this.state.restartVisible ? " restart-hidden" : "");
      let pointsClassName = "side-div game-points" + (!this.state.gamePointVisible ? " gamepoints-hidden" : "");
      const player1Point = (this.state.player1) ? (this.state.player1.playerName + ": " + this.state.player1.point) : "";
      const player2Point = (this.state.player2) ? (this.state.player2.playerName + ": " + this.state.player2.point) : "";
      return (
        <div>
          <Logout name={this.props.player.name}/>
          <div className="game-control">
            <div className="game">
              <div className="game-board side-div">
                <Board player={this.props.player} gameMap={this.props.gameMap} gameView={this.props.gameView}/>
              </div>
              <div className={pointsClassName}>
                <span className="game-points-text">{player1Point}</span>
                <span className="game-points-text">{player2Point}</span>
              </div>
            </div>
            <div className={restartClassName} onClick={() => this.handleRestart()}>
              <Control restartText="Play Again!"/>
            </div>
          </div>
        </div>
      );
    }

    private setInitialState() {
      if (this.props.player.id === 1) {
        this.state = {
          restartVisible: false,
          gamePointVisible: false,
          player1: { playerName: this.props.player.name, point: 0 },
          player2: null,
        };
      } else if (this.props.player.id === 2) {
        this.state = {
          restartVisible: false,
          gamePointVisible: true,
          player1: { playerName: this.props.gameView.get("pl1"), point: 0 },
          player2: { playerName: this.props.player.name, point: 0 },
        };
      }
    }

    private handleRestart() {
      const gameState = this.props.gameView;
      gameState.set("restart", false);
      for (const key of gameState.keys()) {
        const parsed = parseInt(key, 10);
        if (!isNaN(parsed)) {
          gameState.delete(key);
        }
      }
      gameState.set("next", this.props.player.id);
      gameState.delete("winner");
    }

    private listenForRestart() {
      const stateView = this.props.gameView;
      this.props.gameMap.on("valueChanged", (delta: types.IValueChanged) => {
        if (delta.key === "restart") {
          const value = stateView.get(delta.key) as boolean;
          if (value) {
            console.log("Restart now!");
            this.setState({
              restartVisible: true,
            });
          } else {
            console.log("Restarted the game!");
            this.setState({
              restartVisible: false,
            });
          }
        } else if (delta.key === "counter") {
          const playerCounter = stateView.get("counter") as api.map.Counter;
          const pointVisible = playerCounter.value < 2 ? false : true;
          this.setState({
            restartVisible: this.state.restartVisible,
            gamePointVisible: pointVisible,
          });
        } else if (delta.key === "pl1" || delta.key === "pl2") {
          if (delta.key === "pl1") {
            this.setState({
              player1: {
                playerName: stateView.get("pl1") as string,
                point: 0,
              }
            });
          } else if (delta.key === "pl2") {
            this.setState({
              player2: {
                playerName: stateView.get("pl2") as string,
                point: 0,
              }
            });
          }
        } else if (delta.key === "pl1won" || delta.key === "pl2won") {
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
          }
        }
      });
    }
  }