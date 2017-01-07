import * as React from "react";

import Whiteboard from './Whiteboard'

export class AppContainer extends React.Component<undefined, undefined> {
    render() {
        return (
            <div>
                <h1>Entity Canvas App Container</h1>
                <Whiteboard />
            </div>
        );
    }
}