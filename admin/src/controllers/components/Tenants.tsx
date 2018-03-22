import * as React from "react";
import { TenantManager } from "./TenantManager";

export interface ITenantsProps {
    data: any;
    endpoint: string;
}

export interface ITenantsState {
    data: any;
}

export class Tenants extends React.Component<ITenantsProps, ITenantsState> {
    constructor(props: ITenantsProps) {
        super(props);
        this.state = {
            data: this.props.data,
        };
    }

    render() {
        const data = this.state.data.list;
        return (
          <div>
            <h2 className="tenant-list-header">List of Registered Tenants</h2>
            <TenantManager data={data} endpoint={this.props.endpoint}/>
          </div>
        );
    }
}