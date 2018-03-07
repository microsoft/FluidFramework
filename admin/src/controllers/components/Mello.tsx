import * as React from "react";

// 'HelloProps' describes the shape of props.
// State is never set so we use the '{}' type.
export class Mello extends React.Component<{}, {}> {
    render() {
        return <h4>Mello from something and nothing!</h4>;
    }
}