import { api } from "@prague/routerlicious";
import * as React from "react";
import Slider from 'rc-slider';

import 'rc-slider/assets/index.css';

import prague = api;
import types = prague.types;

export interface IBoardState {
    squares: any[];
    iAmNext: boolean;
    winner: any;
    nPlayers: number;
    historyMode: boolean;
}

export interface IBoardProps {
    player: any;
    gameMap: types.IMap;
    gameView: types.IMapView;
}

export interface ISquareProps {
    value: any;
    onClick: () => void;
}

export class Board extends React.Component<IBoardProps, IBoardState> {

    private history: IBoardState[] = [];
    constructor(props: IBoardProps) {
      super(props);
      this.setGameState(true);
      this.listenToUpdate();
    }

    handleClick(i: number) {
      if (this.state.winner || !this.state.iAmNext || this.state.squares[i] || this.state.nPlayers < 2 || this.state.historyMode) {
        return;
      }
      const playerId = this.props.player.id;
      this.props.gameView.set(i.toString(), playerId);
      this.props.gameView.set("next", playerId === 1 ? 2 : 1);
    }

    renderSquare(i: number) {
      return (
        <Square
          value={this.state.squares[i]}
          onClick={() => this.handleClick(i)}
        />
      );
    }

    render() {
      const winner = this.state.winner;
      const nPlayers = this.state.nPlayers;
      let status;
      if (nPlayers < 2) {
        status = 'Waiting for other player to join...';
      } else {
        if (winner) {
          status = (winner === 3) ? 'Match drawn!' : 'Winner: ' + this.getPlayerNameFromId(winner);
        } else {
          const otherPlayerName = this.getPlayerNameFromId(this.getOtherPlayerId(this.props.player.id));
          const nextMoveStatus = this.state.iAmNext ? "Your move. Go Ahead!" : ("Next move: " + otherPlayerName);
          status = nextMoveStatus;
        }
      }
      const historyClassName = this.state.historyMode ? "history-slider" : "history-slider history-hidden";
      const sliderMax = this.history.length - 1;
      console.log(`Slied max: ${sliderMax}`);
      return (
        <div>
            <div className="status">{status}</div>
            <div className="board-row">
              {this.renderSquare(0)}
              {this.renderSquare(1)}
              {this.renderSquare(2)}
            </div>
            <div className="board-row">
              {this.renderSquare(3)}
              {this.renderSquare(4)}
              {this.renderSquare(5)}
            </div>
            <div className="board-row">
              {this.renderSquare(6)}
              {this.renderSquare(7)}
              {this.renderSquare(8)}
            </div>
            <div className={historyClassName}>
              <Slider dots step={1} defaultValue={sliderMax} min={0} max={sliderMax} onAfterChange={(value: number) => this.log(value)} dotStyle={{ borderColor: 'orange' }} activeDotStyle={{ borderColor: 'yellow' }} />
            </div>
        </div>
      );
    }

    private listenToUpdate() {
        this.props.gameMap.on("valueChanged", (delta: types.IValueChanged) => {
          if (delta.key === "restart") {
            const value = this.props.gameView.get(delta.key) as boolean;
            console.log(`Restart request`);
            console.log(value);
            if (!value) {
              console.log(`Resetting history!`);
              this.setState({
                historyMode: false
              });
              this.history = [];
              this.setGameState(false);
            } else {
              console.log(`Setting history mode!`);
              this.setState({
                historyMode: true
              });
            }
          } else {
            this.setGameState(false);
          }
        });
    }

    private setGameState(initial: boolean) {
        console.log(`Setting game state!`);
        const stateView = this.props.gameView;
        const squares = Array(9).fill(null);
        for (let cell of stateView.keys()) {
            const parsed = parseInt(cell, 10);
            if (isNaN(parsed)) continue;
            const cellValue = stateView.get(cell) as Number;
            if (cellValue === 1) {
                squares[parsed] = 'X';
            } else {
                squares[parsed] = 'O';
            }
        }
        const iAmNext = ((stateView.get("next") as number) === this.props.player.id) ? true : false;
        const winner = stateView.has("winner") ? stateView.get("winner") as number : null;
        const playerCounter = stateView.get("counter") as api.map.Counter;
        const nPlayers = playerCounter.value;

        if (initial) {
            this.state = {
                squares,
                iAmNext,
                winner,
                nPlayers,
                historyMode: false,
            };
            this.addToHistory();
        } else {
            this.setState({
                squares,
                iAmNext,
                winner,
                nPlayers,
            }, () => {
              this.addToHistory();
            });
        }
        if (!winner) {
            const winner = this.calculateWinner(squares);
            if (winner) {
                stateView.set("winner", winner);
                this.updateStat(winner);
            }
        }
    }

    private calculateWinner(squares: any[]) {
        const lines = [
          [0, 1, 2],
          [3, 4, 5],
          [6, 7, 8],
          [0, 3, 6],
          [1, 4, 7],
          [2, 5, 8],
          [0, 4, 8],
          [2, 4, 6],
        ];
        for (let i = 0; i < lines.length; i++) {
          const [a, b, c] = lines[i];
          if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
            this.props.gameView.set("restart", true);
            return squares[a] === 'X' ? 1 : 2;
          }
        }
        for (const cell of squares) {
            if (!cell) {
                return null;
            }
        }
        this.props.gameView.set("restart", true);
        return 3;
    }

    private updateStat(winner: number) {
      const winnerName = (winner === 3) ? "drawn" : (winner === 1 ? "pl1won" : "pl2won");
      this.updateWinCounter(winnerName);
    }

    private updateWinCounter(winnerKey: string) {
      const stateView = this.props.gameView;
      if (!stateView.has(winnerKey)) {
        stateView.set(winnerKey, 0);
      }
      const oldValue = stateView.get(winnerKey) as number;
      stateView.set(winnerKey, oldValue + 1);
    }

    private getPlayerNameFromId(pid: number): string {
        return this.props.gameView.get("pl" + pid.toString()) as string;
    }

    private getOtherPlayerId(selfId: number): number {
        return selfId === 1 ? 2 : 1;
    }

    private log(index: number) {
      console.log(index);
      console.log(this.history[index].squares);
      this.history[index].historyMode = true;
      this.setState(this.history[index]);
    }

    private compareBoard(pBoard: any[], cBoard: any[]) {
      for (let i = 0; i < 9; ++i) {
        if (pBoard[i] !== cBoard[i]) {
          return false;
        }
      }
      return true;
    }
    private addToHistory() {
      const state = this.state;
      if (this.history.length === 0) {
        this.history.push(state);
      } else {
        const lastBoard = this.history[this.history.length - 1];
        if (this.compareBoard(lastBoard.squares, state.squares)) {
          return;
        }
        this.history.push(state);
      }
      console.log(`Current history size: ${this.history.length}`);
      this.setState({});
    }
}

  function Square(props: ISquareProps) {
    return (
      <button className="square" onClick={props.onClick}>
        {props.value}
      </button>
    );
  }