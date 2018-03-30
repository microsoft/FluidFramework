import * as React from "react";
import { Board, IBoardProps } from "./Board";

export class Game extends React.Component<IBoardProps, {}> {
    constructor (props: IBoardProps) {
        super(props);
        this.state = {
          menuOpen: false,
        };
    }

    render() {
      return (
        <div className="game">
          <div className="game-board">
            <Board player={this.props.player} gameMap={this.props.gameMap} gameView={this.props.gameView}/>
          </div>
          <div className="game-info">
            <div>{/* status */}</div>
            <ol>{/* TODO */}</ol>
          </div>
        </div>
      );
    }
  }