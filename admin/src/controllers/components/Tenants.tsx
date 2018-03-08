import * as React from "react";
import ReactTable from "react-table";
import "react-table/react-table.css";

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
            <h4>List of Registered Tenants</h4>
            <ReactTable
              data={data}
              columns={[
                {
                    Header: "Id",
                    accessor: "id"
                },
                {
                    Header: "Key",
                    accessor: "key"
                },
                {
                    Header: "Storage",
                    accessor: "storage"
                },
              ]}
              defaultPageSize={5}
              className="-striped -highlight"
            />
            <nav className="add-buttons">
                <a onClick={this.addTenant}>
                Add new tenant
                </a>
            </nav>
          </div>
        );
    }
}