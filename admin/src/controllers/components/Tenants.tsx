import * as React from "react";
import { TenantManager } from "./TenantManager";

export interface ITenantsProps {
    data: any;
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
    addTenant() {
        console.log(`Clicked new tenant!`);
    }
    render() {
        const data = this.state.data.list;
        return (
          <div>
            <h2>List of Registered Tenants</h2>
            <TenantManager data={data}/>
          </div>
        );
    }
}