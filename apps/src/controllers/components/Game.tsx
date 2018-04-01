import { api } from "@prague/routerlicious";
import * as React from "react";
import { Board, IBoardProps } from "./Board";
import { Control } from "./Control";
import { Logout } from "./Logout";

import prague = api;
import types = prague.types;

export interface IGameState {
  retsartVivisble: boolean;
}

export class Game extends React.Component<IBoardProps, IGameState> {
    constructor (props: IBoardProps) {
        super(props);
        this.state = {
          retsartVivisble: false,
        };
        this.listenForRestart();
    }

    render() {
      let className = "game-info" + (!this.state.retsartVivisble ? " restart-hidden" : "");
      return (
        <div>
          <Logout name={this.props.player.name}/>
          <div className="game">
            <div className="game-board">
              <Board player={this.props.player} gameMap={this.props.gameMap} gameView={this.props.gameView}/>
            </div>
          </div>
          <div className={className} onClick={() => this.handleRestart()}>
              <Control restartText="Play Again!"/>
          </div>
        </div>
      );
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
              retsartVivisble: true,
            });
          } else {
            console.log("Restarted the game!");
            this.setState({
              retsartVivisble: false,
            });
          }
        }
      });
    }
  }