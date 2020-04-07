/* eslint-disable @typescript-eslint/consistent-type-assertions */
/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import {
    IconButton,
    IContextualMenuProps,
    TextField,
    initializeIcons,
} from "office-ui-fabric-react";
import { MarkerType } from "../interfaces/MarkerInteraces";

initializeIcons();
interface MarkerProps {
    id: string,
    key: string,
    text: string,
    lat: number,
    lng: number,
    type: MarkerType,
    onValueChange?: (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
    removeMarker?: (id: string) => void;
}

interface MarkerState {
    value: number,
    isChanging: boolean
}

class Marker extends React.Component<MarkerProps, MarkerState> {
    private readonly styles = {
        marker: {
            position: "absolute",
            top: "50%",
            left: "50%",
            userSelect: "none",
            transform: "translate(-50%, -50%)",
            zIndex: 1,
        } as React.CSSProperties,
        inputContainer: {
            backgroundColor: "white",
            border: "1px black solid",
            borderRadius: "2px",
            width: "10vh",
        } as React.CSSProperties,
    };

    constructor(props: any) {
        super(props);
        this.state = {
            value: props.value,
            isChanging: false,
        };
    }

    public render() {
        const {id, lat, lng, type, text, removeMarker, onKeyDown, onValueChange} = this.props;
        const randomColor = `#${Math.floor(Math.random()*16777215).toString(16)}`;
        const menuProps: IContextualMenuProps = {
            items: [
                {
                    key: "goTo",
                    text: `Go to ${text}`,
                    iconProps: { iconName: "NavigateForward" },
                    onClick: () => {
                        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`);
                    },
                },
            ],
            directionalHintFixed: true,
        };
        const markerStyles = {...this.styles.marker, ...{
            color: randomColor,
            border: `${randomColor} solid 1px`,
        }};
        switch(type) {
            case MarkerType.Pin:
                if (removeMarker) {
                    menuProps.items.push({
                        key: "remove",
                        text: "Remove",
                        iconProps: { iconName: "RemoveFilter" },
                        onClick: () => removeMarker(id),
                    });
                }
                return (
                    <IconButton
                        style={markerStyles}
                        menuProps={menuProps}
                        iconProps={{iconName : "Location"}}
                        title={this.props.text}
                    />
                );
            case MarkerType.User:
                return (
                    <IconButton
                        style={markerStyles}
                        menuProps={menuProps}
                        iconProps={{iconName : "UserOptional"}}
                        title={this.props.text}
                    />
                );
            default:
                return (
                    <div style={this.styles.inputContainer}>
                        <TextField
                            style={{fontSize: "12px"}}
                            onChange={onValueChange}
                            onKeyDown={onKeyDown}
                            value={this.props.text}
                            onClick={(event) => event.stopPropagation() }
                        />
                    </div>
                );
        }

    }
}


// eslint-disable-next-line import/no-default-export
export default Marker;
