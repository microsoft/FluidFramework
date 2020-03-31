/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { PlayerProgressKey, PlayerStateKey, PlayerStates } from '../interfaces/PlayerInterfaces';

interface SliderProps {
    value: number,
    root: any,
    reactPlayerRef: any
}

interface SliderState {
    value: number,
    isChanging: boolean
}

class Slider extends React.Component<SliderProps, SliderState> {
    private styles = {
      input: {
        width: "90%",
      },
      inputContainer: {
        alignItems: "center",
        width: "100%",
        margin: "2vh",
        marginBottom: ".5vh"
      }
    }

    constructor(props: any) {
        super(props);
        this.state = {
            value: props.value,
            isChanging: false
        };
    }

    public render() {
        return (
          <div style={this.styles.inputContainer}>
            <input
              style={this.styles.input}
              type='range' min={0} max={1} step='any'
              value={this.state.isChanging ? this.state.value : this.props.value}
              onMouseDown={this._onSeekMouseDown}
              onChange={this._onSeekChange}
              onMouseUp={this._onSeekMouseUp}
            />
          </div>  
        );
    }


    private _onSeekMouseDown = e => {
        console.log("is seeking");
        this.props.root.set(PlayerStateKey, PlayerStates.Seeking);
        this.setState({isChanging: true});
      }

      private _onSeekChange = e => {
        const seekValue = parseFloat(e.target.value);
        console.log(seekValue);
        const seekSeconds = seekValue * this.props.reactPlayerRef.getDuration();
        this.props.root.set(PlayerStateKey, PlayerStates.Seeking);
        this.props.root.set(PlayerProgressKey, seekSeconds);
        this.setState({value: seekValue});
      }

      private _onSeekMouseUp = e => {
        console.log("seek finished");
        const seekValue = parseFloat(e.target.value);
        const seekSeconds = seekValue * this.props.reactPlayerRef.getDuration();
        this.props.root.set(PlayerProgressKey, seekSeconds);
        this.props.root.set(PlayerStateKey, PlayerStates.Seeking);
        setTimeout(() =>  {
          this.props.root.set(PlayerStateKey, PlayerStates.Playing);
          this.props.root.set(PlayerProgressKey, seekSeconds);
        }, 500);
        this.setState({isChanging: false})
      }
}


export default Slider;