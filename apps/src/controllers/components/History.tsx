import * as React from "react";

import Slider from 'rc-slider';

import 'rc-slider/assets/index.css';

export interface IHistoryProps {
    value: number;
    min: number;
    max: number;
    onSliderChange: (value) => void;
}

export interface IHistoryState {
    value: number;
}

export class History extends React.Component<IHistoryProps, IHistoryState> {
    constructor(props: IHistoryProps) {
        super(props);
        // Because of the async nature, this is rendered before all the states are arrived. So adding 1 to adjust it.
        this.state = {
            value: this.props.max + 1
        }
    }
    render() {
        return (
            <Slider dots step={1} value={this.state.value} min={this.props.min} max={this.props.max} onChange={(value: number) => {this.setState({value}); this.props.onSliderChange(value);} } dotStyle={{ borderColor: 'orange' }} activeDotStyle={{ borderColor: 'yellow' }} />
        );
    }
}