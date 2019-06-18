/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import "./index.css";
import { Matchup } from "./matchup";
import { RegionRound } from "./region-round";
import { ISharedMap } from "@prague/map";
import {FullTeamsArray } from "./schedule";

interface IProps {
  bracket: ISharedMap;
}

export class Bracket extends React.Component<IProps, any> {
  componentDidMount() {}

  render() {
      let i = 0;
    return (
      <div className="bracket standings light-blue">
        <div id="content-wrapper">
          <div id="bracket">
            <div id="round1" className="round">
              <RegionRound regionString={"East"} region={1}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i*2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={FullTeamsArray[i* 2 - 2]}
                  lowTeam={FullTeamsArray[i * 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
              </RegionRound>
              <RegionRound regionString={"West"} region={2}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
              </RegionRound>
              <RegionRound regionString={"South"} region={3}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
              </RegionRound>
              <RegionRound regionString={"Midwest"} region={4}>
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={1}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={2}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={3}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={4}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={5}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={6}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={7}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
                />
                <Matchup
                  bracket={this.props.bracket}
                  game={i++}
                  matchNumber={8}
                  highTeam={FullTeamsArray[i*2 - 2]}
                  lowTeam={FullTeamsArray[i* 2 - 1]}
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
                  lowTeam={{ name: "Anyone", seed: 1, winner: false }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
