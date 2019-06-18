/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

interface p {
    getId: () => string,
    setId: (newId) => void,
    style: React.CSSProperties
}

interface s {
    id: string
}

export class Properties extends React.PureComponent<p, s> {
    constructor(props: p) {
        super(props);

        this.state = {
            id: this.props.getId()
        }

        this.updateIdInfo = this.updateIdInfo.bind(this);
    }

    updateIdInfo(event: React.ChangeEvent<HTMLInputElement>) {
        this.props.setId(event.target.value);
        this.setState({ id: this.props.getId() });
    }

    render() {
        return (
            <div style={this.props.style}>
                <span>DocumentId:</span>
                <input type="text" value={this.state.id} onChange={this.updateIdInfo}></input>
            </div>
        );
    }
}
