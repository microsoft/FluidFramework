import * as React from "react";

export interface IMove {
    x: number;
    y: number;
    move: string;
}

export interface ISnakeProps {
    body: string;
    name: string;
}

export class Body extends React.Component<ISnakeProps, {}> {
    constructor(props: ISnakeProps) {
        super(props);
        console.log("body Construct");
    }

    public render() {
        console.log("bodyRender");
        return (
            <h1> {this.props.name}: {this.props.body} </h1>
        );
    }
}
