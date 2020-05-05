/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ITenant } from "../../definitions";
import { TenantManager } from "./TenantManager";

export interface ITenantsProps {
    data: ITenant[];
}

export interface ITenantsState {
    data: ITenant[];
}

export class Tenants extends React.Component<ITenantsProps, ITenantsState> {
    constructor(props: ITenantsProps) {
        super(props);
        this.state = {
            data: this.props.data,
        };
    }

    public render() {
        return (
          <div>
            <h2 className="tenant-list-header">List of Registered Tenants</h2>
            <TenantManager data={this.state.data} />
          </div>
        );
    }
}
