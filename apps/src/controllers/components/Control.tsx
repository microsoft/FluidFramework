import * as React from "react";

export interface IContentProps {
    restartText: string;
}

export class Control extends React.Component<IContentProps, {}> {
    constructor(props: IContentProps) {
        super(props);
    }
    render() {
        return (
            <div>
                <span className="restart-text">{this.props.restartText}</span>
            </div>
        );
    }
}