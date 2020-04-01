/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";

interface MarkerProps {
   key: string,
   text: string,
   lat: number,
   lng: number
}

interface MarkerState {
    value: number,
    isChanging: boolean
}

class Marker extends React.Component<MarkerProps, MarkerState> {
    private styles = {
        marker: {
            position: "absolute",
            top: "50%",
            left: "50%",
            width: "18px",
            height: "18px",
            backgroundColor: "black",
            border: "2px solid #fff",
            borderRadius: "100%",
            userSelect: "none",
            transform: "translate(-50%, -50%)",
            "&:hover": {
                zIndex: 1
            }
        } as React.CSSProperties
    }

    constructor(props: any) {
        super(props);
        this.state = {
            value: props.value,
            isChanging: false
        };
    }

    public render() {
        return (
          <div style={this.styles.marker}>
            <label>{this.props.text}</label>
          </div>  
        );
    }
}


export default Marker;