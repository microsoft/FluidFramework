/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISharedMap } from '@prague/map';
import * as React from 'react';

interface WinnerTextProps {
  map: ISharedMap;
}

interface WinnerTextState {
  highScore: number;
  teamName: string;
  tied: boolean;
}

export class WinnerText extends React.Component<WinnerTextProps, WinnerTextState> {

  constructor(props: WinnerTextProps) {
    super(props);
    this.state = WinnerText.determineWinner(props.map);
  }

  componentWillMount() {
    // When any of the values of the map change, determine the current winner and re-render
    this.props.map.on("valueChanged", () => {
      this.setState(WinnerText.determineWinner(this.props.map));
    });
  }

  render() {
    let text: string;
    if (this.state.tied) {
      text = "Tied!"
    } else {
      text = `${this.state.teamName} are winning!`
    }
    return (
      <div className="box has-text-centered is-size-4">
        {text}
      </div>
    );
  }

  // TODO: This is terrible and should be improved
  private static determineWinner(map: ISharedMap): WinnerTextState {
    let teamName = "None";
    let highScore = 0;
    let tied = true;
    let first = true;
    let initialScore: number;

    map.forEach(
      (counter, key) => {
        if (first) {
          initialScore = counter.value;
          first = false;
        }

        let currentScore: number = counter.value;
        // console.log(`High score is ${highScore} by ${teamName}`);
        // console.log(`Checking ${key}'s score: ${value}`)
        if (currentScore !== initialScore) {
          tied = false;
        }

        if (currentScore > highScore) {
          highScore = currentScore;
          teamName = key;
        }
      });
    return { highScore, teamName, tied };
  }
}
