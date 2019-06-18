/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { IKeyValue } from "../../definitions";
import { KeyValueManager } from "./KeyValueManager";

export interface IKeyValuesProps {
    data: IKeyValue[];
}

export interface IKeyValuesState {
    data: IKeyValue[];
}

export class KeyValues extends React.Component<IKeyValuesProps, IKeyValuesState> {
    constructor(props: IKeyValuesProps) {
        super(props);
        this.state = {
            data: this.props.data,
        };
    }

    public render() {
        return (
          <div>
            <h2 className="tenant-list-header">Key-values</h2>
            <KeyValueManager data={this.state.data} />
          </div>
        );
    }
}
