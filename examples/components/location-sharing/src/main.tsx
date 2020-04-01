/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { ISharedDirectory } from "@microsoft/fluid-map";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { Provider, themes, Header } from '@fluentui/react-northstar';
import {
    DefaultButton as Button,
    initializeIcons,
} from "office-ui-fabric-react";
import GoogleMapReact from 'google-map-react';
import Collapsible from 'react-collapsible';
import Marker from "./components/Marker";
import { MarkerType } from "./interfaces/MarkerInteraces";

export const LocationSharingName = "location-sharing";
const googleMapsApiKey = "AIzaSyB3hZKx6Lz32KGiawC3jOe-OGhmBTFerd0";
initializeIcons();

interface ILocationData {
    text: string;
    lat: number;
    lng: number;
    timestamp: number;
    type: MarkerType;
}

const UserLocationDataKey = "UserLocationData"
const UpdateFrequencyMs = 1000;

/**
 * A component to allow you to share your location with others
 */
export class LocationSharing extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(LocationSharing, []);

    public static getFactory() {
        return LocationSharing.factory;
    }

    protected async componentInitializingFirstTime() {
        const dataDict: { [key: string]: ILocationData } = {};
        this.root.set(UserLocationDataKey, dataDict);
    }

    /**
     * Will return a new LocationSharingView
     */
    public render(div: HTMLElement) {
        const rerender = () => {
            const user = this.runtime.clientId ? this.runtime.getQuorum().getMember(this.runtime.clientId) : undefined;
            const userName = (user?.client.user as any).name;
            ReactDOM.render(
                <Provider theme={themes.teams}>
                    <LocationSharingView
                        root={this.root}
                        userName={userName}
                    />
                </Provider>
                ,
                div,
            );
        }
        if (this.runtime.connected) {
            rerender();
        } else {
            this.runtime.once("connected", () => rerender());
        }
    }
}

interface ILocationSharingViewProps {
    root: ISharedDirectory;
    userName: string;
}

interface ILocationSharingViewState {
    mapCenter?: {
        lat: number,
        lng: number
    },
    mapZoom: number,
    userLocationData: {[key: string]: ILocationData},
    isUserListOpen: boolean,
    lastClickedPosition?: {
        lat: number,
        lng: number
    },
    newPinName: string
}

class LocationSharingView extends React.Component<ILocationSharingViewProps, ILocationSharingViewState> {
    constructor(props: ILocationSharingViewProps){
        super(props);
        const { root } = this.props;
        this.state = {
            mapCenter: undefined,
            mapZoom: 11,
            userLocationData: root.get(UserLocationDataKey),
            isUserListOpen: false,
            newPinName: ""
        }
        this.setCurrentLocation();
        root.on("valueChanged", (change, local) => {
            const newData = root.get(UserLocationDataKey);
            if (newData != this.state.userLocationData) {
                this.setState({ userLocationData: newData});
            }
        });
    }

    private setCurrentLocation(lastPosition?: Position) {
        const {root, userName} = this.props;
        this.setState({ userLocationData: root.get(UserLocationDataKey)});
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position: Position) => {
                const currentData = root.get(UserLocationDataKey);
                if (!lastPosition 
                    || currentData[`user-${userName}`] === undefined
                    || lastPosition.coords.latitude != position.coords.latitude 
                    || lastPosition.coords.longitude != position.coords.longitude) {
                    const updateCurrentLocation = () => {
                        console.log("Setting location...");
                        this.setState({
                            mapCenter: {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            }
                        });
                        const currentUserLocationData: ILocationData = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            timestamp: new Date().getTime(),
                            text: userName,
                            type: MarkerType.User
                        };
                        currentData[`user-${userName}`] = currentUserLocationData;
                        root.set(UserLocationDataKey, currentData);
                        setTimeout(() => this.setCurrentLocation(position), UpdateFrequencyMs);
                    }
                    if (this.state.mapCenter)
                    {
                        this.setState({mapCenter: undefined}, updateCurrentLocation);
                    } else {
                        updateCurrentLocation();
                    }
                } else {
                    setTimeout(() => this.setCurrentLocation(lastPosition), UpdateFrequencyMs);
                }
            })
        }
    }

    render(){
        const { } = this.props;
        const { lastClickedPosition, isUserListOpen, mapCenter, mapZoom, newPinName } = this.state;
        if (mapCenter) {
            const userListButton = (
                <Button
                    iconProps={{ iconName: this.state.isUserListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                    style={{width: "30%", height: "40px", position: "absolute", left: 0, top: 0, margin: "1vh"}}
                    onClick={this.onUsersClick}
                >
                    {"Pinned Locations"}
                </Button>
            );
            const users = this.renderList();
            const markers = this.renderMarkers();
            if (lastClickedPosition) {
                var clickedPosition = 
                    <Marker
                        id={'clickedPosition'}
                        key={`clickedPosition`}
                        text={newPinName}
                        lat={lastClickedPosition.lat}
                        lng={lastClickedPosition.lng}
                        type={MarkerType.Input}
                        onKeyDown={this.onPinKeyDown}
                        onValueChange={this.onPinInputChange}
                    />;
                markers.push(clickedPosition);
            }
            return (
                <div style={{ height: '100vh', width: '100%' }}>
                    <GoogleMapReact
                        bootstrapURLKeys={{ key: googleMapsApiKey }}
                        defaultCenter={mapCenter}
                        defaultZoom={mapZoom}
                        onClick={({ x, y, lat, lng, event }) => this.setState({lastClickedPosition: {lat, lng}})}
                    >
                        {markers}
                    </GoogleMapReact>
                    <Collapsible open={isUserListOpen} trigger={userListButton}>{users}</Collapsible>
                </div>
            );
        }
        return <Header style={{margin: "3vh"}}>{"Loading..."}</Header>;
    }

    private onPinInputChange = (event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        if (newValue) {
            this.setState({newPinName: newValue});
        }
    }

    private removeMarker = (id: string) => {
        const {root} = this.props;
        const newData = root.get(UserLocationDataKey);
        delete newData[id];
        root.set(UserLocationDataKey, newData);
    }

    private onPinKeyDown = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { root, userName } = this.props;
        const { lastClickedPosition, newPinName } = this.state;
        if (event.key === 'Enter' && lastClickedPosition && newPinName && newPinName !== "") {
            const currentUserLocationData: ILocationData = {
                lat: lastClickedPosition.lat,
                lng: lastClickedPosition.lng,
                timestamp: new Date().getTime(),
                text: newPinName,
                type: MarkerType.Pin
            };
            const newData = root.get(UserLocationDataKey);
            newData[`pin-${userName}-${newPinName}`] = currentUserLocationData;
            root.set(UserLocationDataKey, newData);
            this.setState({lastClickedPosition: undefined, newPinName: ""});
        }
    }

    private renderMarkers = () => {
        const { userLocationData } = this.state;
        const items: JSX.Element[] = [];
        for (var id in userLocationData) {
            var item = userLocationData[id];
            items.push(
                <Marker
                    id={id}
                    key={`${item.timestamp}-${item.text}`}
                    text={item.text}
                    lat={item.lat}
                    lng={item.lng}
                    type={item.type}
                    removeMarker={this.removeMarker}
                />
            )
        }
        return items;
    }

    private renderList = () => {
        const { userLocationData, isUserListOpen } = this.state;
        if (isUserListOpen) {
            const items: JSX.Element[] = [];
            for (var key in userLocationData) {
                var item = userLocationData[key];
                items.push(this.renderItem(item))
            }
            return (
                <ul style={{maxHeight: "356px", border: "1px solid grey", backgroundColor: "white", overflow: "auto", paddingInlineStart: "0px", overflowY: "scroll", position: "absolute", top: 0, marginTop: "5.1vh", marginLeft: "1vh"}}>
                    {items}
                </ul>
            )
        } else {
            return <h6 style={{marginBlockStart: "5px", marginBlockEnd: "0px", color: "grey"}}>{"User list is empty."}</h6>;
        }
    }

    private renderItem = (item: ILocationData) => {
        return(
            <div key={`user_${item.text}`} style={{position: "relative", width: "100%"}}>
                <Button 
                    onClick={() => this.onUserItemClick(item)}
                    style={{height: "6vh", width: "100%", textAlign: "left"}}
                    iconProps={{ iconName: item.type === MarkerType.User ? "UserOptional" : "Location" }}
                >
                    <div>
                        <h4 style={{marginBlockStart: "0px", marginBlockEnd: "0px"}}>{item.text}</h4>
                        <h5 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "grey"}}>{`${item.lat.toFixed(2)} x ${item.lng.toFixed(2)}`}</h5>
                    </div>
                </Button>
            </div>         
        );
    }

    private onUserItemClick = (item: ILocationData) => {
        this.setState({mapCenter: undefined, isUserListOpen: false}, () => this.setState({mapCenter: {
            lat: item.lat,
            lng: item.lng
        }}));
    }

    private onUsersClick = () => {
        this.setState({
          isUserListOpen: !this.state.isUserListOpen
        });
      }
}

export const fluidExport = LocationSharing.getFactory();