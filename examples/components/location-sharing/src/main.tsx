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
import { Provider, themes } from '@fluentui/react-northstar';
import {
    initializeIcons,
    Text
} from "office-ui-fabric-react";

export const LocationSharingName = "location-sharing";

initializeIcons();

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
    
    }

    /**
     * Will return a new LocationSharingView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <Provider theme={themes.teams}>
                <LocationSharingView
                    root={this.root}
                />
            </Provider>
            ,
            div,
        );
    }
}

interface ILocationSharingViewProps {
    root: ISharedDirectory;
}

interface ILocationSharingViewState {

}

class LocationSharingView extends React.Component<ILocationSharingViewProps, ILocationSharingViewState> {

    constructor(props: ILocationSharingViewProps){
        super(props);
        const {root} = this.props;
        this.state = {
           
        }
        root.on("valueChanged", (change, local) => {

        });
    }

    render(){
        const { } = this.props;
        const { } = this.state;
        return <Text>{"Hello world"}</Text>
    }
}

export const fluidExport = LocationSharing.getFactory();