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

export const LocationSharingName = "location-sharing";
const googleMapsApiKey = "AIzaSyB3hZKx6Lz32KGiawC3jOe-OGhmBTFerd0";
initializeIcons();

interface IUserLocationData {
    userName: string;
    lat: number;
    lng: number;
    timestamp: number;
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
        const dataDict: { [key: string]: IUserLocationData } = {};
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
    userLocationData: {[key: string]: IUserLocationData},
    isUserListOpen: boolean,
}

class LocationSharingView extends React.Component<ILocationSharingViewProps, ILocationSharingViewState> {

    constructor(props: ILocationSharingViewProps){
        super(props);
        const { root, userName } = this.props;
        this.state = {
            mapCenter: undefined,
            mapZoom: 11,
            userLocationData: root.get(UserLocationDataKey),
            isUserListOpen: false
        }
        this.setCurrentLocation(root, userName);

        root.on("valueChanged", (change, local) => {
            if (root.get(UserLocationDataKey) != this.state.userLocationData) {
                this.setState({ userLocationData: root.get(UserLocationDataKey)});
            }
        });
    }

    private setCurrentLocation(root: ISharedDirectory, userName: string, lastPosition?: Position) {
        this.setState({ userLocationData: root.get(UserLocationDataKey)});
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position: Position) => {
                if (!lastPosition || lastPosition.coords.latitude != position.coords.latitude || lastPosition.coords.longitude != position.coords.longitude) {
                    const updateCurrentLocation = () => {
                        console.log("Setting location...");
                        this.setState({
                            mapCenter: {
                                lat: position.coords.latitude,
                                lng: position.coords.longitude
                            }
                        });
                        const currentUserLocationData: IUserLocationData = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                            timestamp: new Date().getTime(),
                            userName: userName
                        };
                        const newData = this.state.userLocationData;
                        newData[userName] = currentUserLocationData;
                        root.set(UserLocationDataKey, newData);
                        setTimeout(() => this.setCurrentLocation(root, userName, position), UpdateFrequencyMs);
                    }
                    if (this.state.mapCenter)
                    {
                        this.setState({mapCenter: undefined}, updateCurrentLocation);
                    } else {
                        updateCurrentLocation();
                    }
                } else {
                    setTimeout(() => this.setCurrentLocation(root, userName, lastPosition), UpdateFrequencyMs);
                }
            })
        }
    }

    render(){
        const { } = this.props;
        const { isUserListOpen, mapCenter, mapZoom } = this.state;
        if (mapCenter) {
            const userListButton = (
                <Button
                    iconProps={{ iconName: this.state.isUserListOpen ? "ChevronUpEnd6" : "ChevronDownEnd6" }}
                    style={{width: "20%", height: "40px", position: "absolute", left: 0, top: 0}}
                    onClick={this.onUsersClick}
                >
                    {"Users"}
                </Button>
            );
            const users = this.renderList();
            const markers = this.renderMarkers();
            return (
                <div style={{ height: '100vh', width: '100%' }}>
                    <GoogleMapReact
                        bootstrapURLKeys={{ key: googleMapsApiKey }}
                        defaultCenter={mapCenter}
                        defaultZoom={mapZoom}
                    >
                        {markers}
                    </GoogleMapReact>
                    <Collapsible open={isUserListOpen} trigger={userListButton}>{users}</Collapsible>
                </div>
            );
        }
        return <Header style={{margin: "3vh"}}>{"Loading..."}</Header>;
    }

    private renderMarkers = () => {
        const { userLocationData } = this.state;
        const items = [];
        for (var key in userLocationData) {
            var item = userLocationData[key];
            items.push(
                <Marker
                    key={`${item.timestamp}-${item.userName}`}
                    text={item.userName}
                    lat={item.lat}
                    lng={item.lng}
                />
            )
        }
        return items;
    }

    private renderList = () => {
        const { userLocationData, isUserListOpen } = this.state;
        if (isUserListOpen) {
            const items = [];
            for (var key in userLocationData) {
                var item = userLocationData[key];
                items.push(this.renderItem(item))
            }
            return (
                <ul style={{maxHeight: "356px", border: "1px solid grey", backgroundColor: "white", overflow: "auto", paddingInlineStart: "0px", overflowY: "scroll", position: "absolute", top: 0, margin: "2vh"}}>
                    {items}
                </ul>
            )
        } else {
            return <h6 style={{marginBlockStart: "5px", marginBlockEnd: "0px", color: "grey"}}>{"User list is empty."}</h6>;
        }
    }

    private renderItem = (item: IUserLocationData) => {
        return(
            <div key={`user_${item.userName}`} style={{position: "relative", width: "100%"}}>
                <Button 
                    onClick={() => this.onUserItemClick(item)}
                    style={{height: "6vh", width: "100%", textAlign: "left"}}
                >
                    <div>
                        <h4 style={{marginBlockStart: "0px", marginBlockEnd: "0px"}}>{item.userName}</h4>
                        <h5 style={{marginBlockStart: "0px", marginBlockEnd: "0px", color: "grey"}}>{`${item.lat} x ${item.lng}`}</h5>
                    </div>
                </Button>
            </div>         
        );
    }

    private onUserItemClick = (item: IUserLocationData) => {
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