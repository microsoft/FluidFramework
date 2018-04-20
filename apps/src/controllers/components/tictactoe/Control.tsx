import * as React from "react";

export interface IContentProps {
    restartText: string;
}

export class Control extends React.Component<IContentProps, {}> {
    constructor(props: IContentProps) {
        super(props);
    }

    public render() {
        return (
            <div className="restart-container">
                <span className="restart-text">{this.props.restartText} <i className="fa fa-undo restart-icon" /></span>
            </div>
        );
    }
}
