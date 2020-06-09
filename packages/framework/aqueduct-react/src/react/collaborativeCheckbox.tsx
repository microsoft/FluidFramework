/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCell } from "@fluidframework/cell";
import React from "react";

interface IProps {
    data: SharedCell;
    id: string;
    className?: string;
    style?: React.CSSProperties;
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

    public componentDidMount() {
        // Register a callback for when the value changes
        this.props.data.on("valueChanged", () => {
            const checked = this.isChecked();
            this.setState({ checked });
        });
    }

    public render() {
        return (
            <input
                type="checkbox"
                className={this.props.className}
                style={this.props.style}
                aria-checked={this.state.checked}
                name={this.props.id}
                checked={this.state.checked}
                onChange={this.updateCheckbox} />
        );
    }

    private updateCheckbox(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.data.set(e.target.checked);
    }

    private isChecked(): boolean {
        return this.props.data.get();
    }
}
