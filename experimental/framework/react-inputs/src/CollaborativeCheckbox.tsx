/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SharedCell } from "@fluidframework/cell";
import React from "react";

export interface ICollaborativeCheckboxProps {
    /**
     * The SharedCell that will store the checkbox value.
     */
    data: SharedCell<boolean>;
    /**
     * The value for the "name" property of the checkbox input
     */
    id: string;
    className?: string;
    style?: React.CSSProperties;
}

export interface ICollaborativeCheckboxState {
    checked: boolean;
}

/**
 * Given a SharedCell will produce a collaborative checkbox.
 */
export class CollaborativeCheckbox
    extends React.Component<ICollaborativeCheckboxProps, ICollaborativeCheckboxState> {
    constructor(props: ICollaborativeCheckboxProps) {
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
        return this.props.data.get() ?? false;
    }
}
