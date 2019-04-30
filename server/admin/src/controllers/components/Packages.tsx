import * as React from "react";
import { IPackage } from "../../definitions";
import { PackageManager } from "./PackageManager";

export interface IPackagesProps {
    data: IPackage[];
}

export interface IPackagesState {
    data: IPackage[];
}

export class Packages extends React.Component<IPackagesProps, IPackagesState> {
    constructor(props: IPackagesProps) {
        super(props);
        this.state = {
            data: this.props.data,
        };
    }

    public render() {
        return (
          <div>
            <h2 className="tenant-list-header">List of Packages</h2>
            <PackageManager data={this.state.data} />
          </div>
        );
    }
}
