import * as React from "react";

export interface ILogoutProps {
    name: string;
}

export class Logout extends React.Component<ILogoutProps, {}> {
    constructor(props: ILogoutProps) {
        super(props);
    }

    public render() {
        return (
            <div className="logout-button">
                <span className="logout-text">{this.props.name}</span>
            </div>
        );
    }
}
