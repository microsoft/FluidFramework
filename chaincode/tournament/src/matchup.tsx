import * as React from "react";
import "./index.css";
import { ITeam, IMatchup } from "./schedule";
import { ISharedMap, IValueChanged } from "@prague/map";
import {nextGame} from "./schedule";

export interface IMatchupProps {
  matchNumber: number; // The match number within the RegionRound
  highTeam?: ITeam;
  lowTeam?: ITeam;
  bracket: ISharedMap;
  game: number;
}

export interface IState {
  winner?: string;
  highTeam?: ITeam;
  lowTeam?: ITeam;
}

// TODO: add winner info
export class Matchup extends React.Component<IMatchupProps, IState> {
  state: IState = {};
  nextGame: string;
  constructor(props: IMatchupProps) {
    super(props);
    this.nextGame = nextGame(props.game).toString();

    // TODO This is sort of worrying because we make high/low mutable for Round 1
    this.state = {
      highTeam: this.props.highTeam,
      lowTeam: this.props.lowTeam
    }
  }

  componentDidMount() {
    this.props.bracket.on("valueChanged", (key: IValueChanged) => {
      if (key.key === this.props.game.toString()) {
        console.log("FOund the right game");
        const updatedMatchup = this.props.bracket.get(key.key);
        this.setState(updatedMatchup);
      }
    });
  }

  render() {
    const { matchNumber, game } = this.props;
    const { highTeam, lowTeam } = this.state;
    // const highTeam = this.props.highTeam !== undefined ? this.props.highTeam : this.state.highTeam;
    // const lowTeam = this.props.lowTeam !== undefined ? this.props.lowTeam : this.state.lowTeam;

    console.log(game);
    const classname = "match m" + matchNumber;
    return (
      <div className={classname}>
        <p className="slot slot1" onClick={this.onClickSlot1}>
          {highTeam !== undefined ? (
            <>
              <span className="seed">{highTeam.seed}</span> {highTeam.name}{" "}
            </>
          ) : (
            <> </>
          )}
        </p>
        <p className="slot slot2" onClick={this.onClickSlot2}>
          {lowTeam !== undefined? (
            <>
              <span className="seed">{lowTeam.seed}</span> {lowTeam.name}{" "}
            </>
          ) : (
            <> </>
          )}
        </p>
      </div>
    );
  }

  // Pick "highTeam" as winner
  onClickSlot1 = () => {
    const highTeam = this.state.highTeam;
    this.setState({
      winner: highTeam.name
    });

    const nextGame = this.props.bracket.get<IMatchup>(this.nextGame);
    nextGame.highTeam = highTeam;
    this.props.bracket.set<IMatchup>(this.nextGame, nextGame);
    alert("Picked " + highTeam.name + " Game: " + this.props.game + " NextGame: " + this.nextGame);
  };

  // Pick "lowTeam" as winner
  onClickSlot2 = () => {
    const lowTeam = this.state.lowTeam;
    this.setState({
      winner: lowTeam.name
    });

    const nextGame = this.props.bracket.get<IMatchup>(this.nextGame);
    nextGame.lowTeam = lowTeam;

    this.props.bracket.set<IMatchup>(this.nextGame, nextGame);
    alert("Picked " + lowTeam.name + " Game: " + this.props.game + " NextGame: " + this.nextGame);
  };
}
