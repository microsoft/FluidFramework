/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Counter } from "@microsoft/fluid-map";
import * as React from "react";

interface IProps {
    counter: Counter;
    id: string;
}

interface IState {
    checked: boolean;
}

export { IProps as ICollaborativeCheckboxProps };
export { IState as ICollaborativeCheckboxState };

/**
 * Fluid enabled checkbox
 * The checkbox uses the counter to ensure consistency if two people both hit the button.
 */
export class CollaborativeCheckbox extends React.Component<IProps, IState> {
    constructor(props: IProps) {
        super(props);

        this.state = {
            checked: this.isChecked(),
        };

        this.updateCheckbox = this.updateCheckbox.bind(this);
        this.isChecked = this.isChecked.bind(this);
    }

    // eslint-disable-next-line react/no-deprecated
    public componentWillMount() {
        // Register a callback for when an increment happens
        this.props.counter.on("incremented", () => {
            const checked = this.isChecked();
            this.setState({ checked });
        });
    }

    public render() {
        return (
            <input
                type="checkbox"
                aria-checked={this.state.checked}
                name= {this.props.id}
                checked = {this.state.checked}
                onChange={this.updateCheckbox} />
        );
    }

    private updateCheckbox(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.counter.increment(1);
    }

    private isChecked(): boolean {
        // Odd is true, even is false
        return this.props.counter.value % 2 !== 0;
    }
}
