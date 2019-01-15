import * as ReactDOM from "react-dom";
import * as React from "react";

interface IProps { }
interface IState { }
    
class App extends React.Component<IProps, IState> {
    constructor(props: Readonly<IProps>) { super(props); }

    render() {
        return (
            <div>
                Hello World
            </div>
        );
    }
}

export function start() {
    ReactDOM.render(
        <App />,
        document.body
    );
}