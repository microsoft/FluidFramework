import * as React from "react";
import "./index.css";
import { Matchup } from "./matchup";
import { RegionRound } from "./region-round";
import { ISharedMap } from "@prague/map";

interface IProps {
  bracket: ISharedMap;
}

export class Bracket extends React.Component<IProps, any> {
  componentDidMount() {}

  render() {
      let i = 0;
    return (
      <body className="bracket standings light-blue">
        <div id="content-wrapper">
          <div id="bracket">
            <div id="round1" className="round">
              <RegionRound regionString={"East"} region={1}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={{ name: "Duke", seed: 1 }}
                  lowTeam={{ name: "NCC/NDAKST", seed: 15 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={{ name: "VCU", seed: 8 }}
                  lowTeam={{ name: "UCF", seed: 9 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={{ name: "WICHST", seed: 5 }}
                  lowTeam={{ name: "VCU", seed: 12 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={{ name: "IND", seed: 4 }}
                  lowTeam={{ name: "NM ST", seed: 13 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={{ name: "W. Va", seed: 6 }}
                  lowTeam={{ name: "Dayton", seed: 11 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={{ name: "KU", seed: 3 }}
                  lowTeam={{ name: "NDSU", seed: 14 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={{ name: "BC", seed: 7 }}
                  lowTeam={{ name: "USC", seed: 10 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={{ name: "Michigan St", seed: 2 }}
                  lowTeam={{ name: "Rob Morris", seed: 15 }}
                />
              </RegionRound>
              <RegionRound regionString={"West"} region={2}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={{ name: "UConn", seed: 1 }}
                  lowTeam={{ name: "Chatt", seed: 15 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={{ name: "BYU", seed: 8 }}
                  lowTeam={{ name: "Texas A&M", seed: 9 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={{ name: "Purdue", seed: 5 }}
                  lowTeam={{ name: "N. IOwa", seed: 12 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={{ name: "Washington", seed: 4 }}
                  lowTeam={{ name: "Miss St.", seed: 13 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={{ name: "Marquette", seed: 6 }}
                  lowTeam={{ name: "Utah St", seed: 11 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={{ name: "Missouri", seed: 3 }}
                  lowTeam={{ name: "Cornell", seed: 14 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={{ name: "Cal", seed: 7 }}
                  lowTeam={{ name: "Maryland", seed: 10 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={{ name: "Memphis", seed: 2 }}
                  lowTeam={{ name: "CS North", seed: 15 }}
                />
              </RegionRound>
              <RegionRound regionString={"South"} region={3}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={{ name: "Pitt", seed: 1 }}
                  lowTeam={{ name: "E Tenn St", seed: 15 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={{ name: "Okla St", seed: 8 }}
                  lowTeam={{ name: "Tennessee", seed: 9 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={{ name: "FSU", seed: 5 }}
                  lowTeam={{ name: "Wisconsin", seed: 12 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={{ name: "Xavier", seed: 4 }}
                  lowTeam={{ name: "Portland St.", seed: 13 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={{ name: "UCLA", seed: 6 }}
                  lowTeam={{ name: "VCU", seed: 11 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={{ name: "Villanova", seed: 3 }}
                  lowTeam={{ name: "American", seed: 14 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={{ name: "Texas", seed: 7 }}
                  lowTeam={{ name: "Minnesota", seed: 10 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={{ name: "Duke", seed: 2 }}
                  lowTeam={{ name: "Binghamton", seed: 15 }}
                />
              </RegionRound>
              <RegionRound regionString={"Midwest"} region={4}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={{ name: "Pitt", seed: 1 }}
                  lowTeam={{ name: "E Tenn St", seed: 15 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={{ name: "Okla St", seed: 8 }}
                  lowTeam={{ name: "Tennessee", seed: 9 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={{ name: "FSU", seed: 5 }}
                  lowTeam={{ name: "Wisconsin", seed: 12 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={{ name: "Xavier", seed: 4 }}
                  lowTeam={{ name: "Portland St.", seed: 13 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={{ name: "UCLA", seed: 6 }}
                  lowTeam={{ name: "VCU", seed: 11 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={{ name: "Villanova", seed: 3 }}
                  lowTeam={{ name: "American", seed: 14 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={{ name: "Texas", seed: 7 }}
                  lowTeam={{ name: "Minnesota", seed: 10 }}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={{ name: "Duke", seed: 2 }}
                  lowTeam={{ name: "Binghamton", seed: 15 }}
                />
              </RegionRound>
            </div>
            <div id="round2" className="round">
              <RegionRound regionString={"East"} region={1}>
                {" "}
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={3} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={4} />
              </RegionRound>
              <RegionRound regionString={"West"} region={2}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={3} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={4} />
              </RegionRound>
              <RegionRound regionString={"South"} region={3}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={3} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={4} />
              </RegionRound>
              <RegionRound regionString={"Midwest"} region={4}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={3} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={4} />
              </RegionRound>
            </div>
            <div id="round3" className="round">
              <RegionRound regionString={"East"} region={1}>
                {" "}
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
              </RegionRound>
              <RegionRound regionString={"West"} region={2}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
              </RegionRound>
              <RegionRound regionString={"South"} region={3}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
              </RegionRound>{" "}
              <RegionRound regionString={"Midwest"} region={4}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
              </RegionRound>
            </div>
            <div id="round4" className="round">
              <RegionRound regionString={"East"} region={1}>
                {" "}
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
              </RegionRound>{" "}
              <RegionRound regionString={"West"} region={2}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
              </RegionRound>
              <RegionRound regionString={"South"} region={3}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
              </RegionRound>{" "}
              <RegionRound regionString={"Midwest"} region={4}>
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
              </RegionRound>
            </div>
            <div id="round5" className="round">
              <div className="region">
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={1} />
                <Matchup bracket={this.props.bracket} game={i++} matchNumber={2} />
              </div>
            </div>
            <div id="round6" className="round">
              <div className="region">
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={{ name: "Michigan", seed: 2, winner: true }}
                  lowTeam={{ name: "Anyone", seed: 2, winner: false }}
                />
              </div>
            </div>
          </div>
        </div>
      </body>
    );
  }
}
