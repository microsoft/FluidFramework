/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as React from "react";

export interface ICollaborativeCheckboxProps {
    checked: boolean;
    onCheckedChange: (newState: boolean) => void;
    id: string;
}

/**
 * Fluid enabled checkbox
 * The checkbox uses the counter to ensure consistency if two people both hit the button.
 */
export class CollaborativeCheckbox extends React.Component<ICollaborativeCheckboxProps> {
    constructor(props: ICollaborativeCheckboxProps) {
        super(props);
        this.changeListener = this.changeListener.bind(this);
    }

    public render() {
        // tslint:disable:react-a11y-input-elements
        return(
            <input
                type="checkbox"
                aria-checked={this.props.checked}
                name={this.props.id}
                checked={this.props.checked}
                onChange={this.changeListener} />
        );
    }

    private changeListener(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.onCheckedChange(e.target.checked);
    }
}
