/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Counter } from "@microsoft/fluid-map";
import * as React from "react";

interface TeamScoreProps {
  name: string;
  colorClass: string;
  counter: Counter;
}

interface TeamScoreState {
  score: number;
}

export class TeamScore extends React.Component<TeamScoreProps, TeamScoreState> {
  public constructor(props: TeamScoreProps) {
    super(props);
    this.state = { score: this.props.counter.value };
  }

  // eslint-disable-next-line react/no-deprecated
  componentWillMount() {
    // When the counter value changes, update the state of the React component
    this.props.counter.on("incremented", () => {
      this.setState({ score: this.props.counter.value });
    });
  }

  // This method wraps a call to increment the counter to ensure we don't decrement below zero
  public increment(i: number): number {
    if (!(this.props.counter.value === 0 && i < 0)) {
      const c = this.props.counter.increment(i);
      return c.value;
    } else {
      return 0;
    }
  }

  public render() {
    let wrapperDivClass = "content has-text-centered ";
    wrapperDivClass += this.props.colorClass;

    return (
      <div className={wrapperDivClass}>
        <div className="subtitle">{this.props.name}</div>
        <div className="title">{this.state.score}</div>
        <div className="columns is-mobile">
          <div className="column">
            <div className="buttons has-addons is-centered">
              <button className="button" onClick={() => { this.increment(1); }}>
                <FontAwesomeIcon icon={faArrowUp} />
                <span>Increment</span>
              </button>
              <button className="button" onClick={() => { this.increment(-1); }}>
                <FontAwesomeIcon icon={faArrowDown} />
                <span>Decrement</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
