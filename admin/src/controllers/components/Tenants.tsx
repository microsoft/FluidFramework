import * as React from "react";

export interface ITenantsProps {
    data: any;
}

export class Tenants extends React.Component<ITenantsProps, {}> {
    constructor(props: ITenantsProps) {
        super(props);
    }
    render() {
        return <h4>Number of tenants: {this.props.data.list.length}!</h4>;
    }
}