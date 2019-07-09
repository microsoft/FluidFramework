/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Counter } from "@prague/map";

import * as React from "react";

interface p {
    counter: Counter;
    id: string;
}

interface s {
    checked: boolean;
}

// tslint:disable:react-a11y-input-elements
export class FluidReactCheckbox extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            checked: this.props.counter.value % 2 !== 0,
        };

        this.updateCheckbox = this.updateCheckbox.bind(this);
    }

    updateCheckbox(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.counter.increment(1);
    }

    componentDidMount() {
        this.props.counter.onIncrement = () => {
            // odd is true even is false
            const checked = this.props.counter.value % 2 !== 0;
            this.setState({ checked });
        };
    }

    render() {
        return(
            <input
                type="checkbox"
                aria-checked={false}
                name= {this.props.id}
                checked = {this.state.checked}
                onChange={this.updateCheckbox} />
        );
    }
}
