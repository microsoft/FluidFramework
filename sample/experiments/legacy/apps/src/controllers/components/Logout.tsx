import * as React from "react";

export interface ILogoutProps {
    name: string;
}

export class Logout extends React.Component<ILogoutProps, {}> {
    constructor(props: ILogoutProps) {
        super(props);
    }
    render() {
        return (
            <div className="logout-button">
                <span className="logout-text">{this.props.name} <a href="/logout"><i className="fa fa-fw fa-power-off logout-icon" /></a>
                </span>
            </div>
        );
    }
}