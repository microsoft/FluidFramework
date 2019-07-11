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

/**
 * Fluid enabled checkbox
 * The checkbox uses the counter to ensure consistency if two people both hit the button.
 */
export class CollaborativeCheckbox extends React.Component<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            checked: this.isChecked(),
        };

        this.updateCheckbox = this.updateCheckbox.bind(this);
        this.isChecked = this.isChecked.bind(this);
    }

    updateCheckbox(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.counter.increment(1);
    }

    isChecked(): boolean {
        // odd is true, even is false
        return this.props.counter.value % 2 !== 0;
    }

    componentWillMount() {
        // Register a callback for when an increment happens
        this.props.counter.onIncrement = () => {
            const checked = this.isChecked();
            this.setState({ checked });
        };
    }

    render() {
        // tslint:disable:react-a11y-input-elements
        return(
            <input
                type="checkbox"
                aria-checked={this.state.checked}
                name= {this.props.id}
                checked = {this.state.checked}
                onChange={this.updateCheckbox} />
        );
    }
}
