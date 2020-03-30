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
    constructor(props: any) {
        super(props);
        this.state = {
            value: props.value,
            isChanging: false
        };
    }


    public render() {
        return (
            <input
            type='range' min={0} max={1} step='any'
            value={this.state.isChanging ? this.state.value : this.props.value}
            onMouseDown={this._onSeekMouseDown}
            onChange={this._onSeekChange}
            onMouseUp={this._onSeekMouseUp}
          />
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
        this.props.root.set(PlayerProgressKey, seekSeconds);
        this.setState({value: seekValue});
      }

      private _onSeekMouseUp = e => {
        console.log("seek finished")
        setTimeout(() => this.props.root.set(PlayerStateKey, PlayerStates.Playing), 2000);
        this.setState({isChanging: false})
      }
}


export default Slider;