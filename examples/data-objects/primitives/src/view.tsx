/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { MapView } from "./map";
import { DdsCollection, INamedMap } from "./model";

interface IDdsCollectionProps {
    ddsCollection: DdsCollection;
}

interface IDdsCollectionState {
    maps: INamedMap[];
}

export class DdsCollectionView extends React.Component<IDdsCollectionProps, IDdsCollectionState> {
    protected readonly newMapTextInput = React.createRef<HTMLInputElement>();

    constructor(props: IDdsCollectionProps) {
        super(props);
        this.state = { maps: [] };
    }

    public render() {
        return <div>
            <div>
                <span>
                    <input type="text" ref={this.newMapTextInput}></input>
                    <button onClick={(e) => this.addMap(e.currentTarget)}>Add Map</button>
                </span>
            </div>
            {this.state.maps.map((map) => <MapView key={map.name} name={map.name} map={map.map}></MapView>)}
        </div>;
    }

    componentDidMount() {
        this.getMaps();
        this.props.ddsCollection.on("mapsChanged", () => this.getMaps());
    }

    private getMaps(): void {
        this.props.ddsCollection.getMaps().then(
            (maps) => this.setState({ maps }),
            (error) => console.log(error),
        );
    }

    private addMap(e: HTMLButtonElement) {
        const newMapNameEl = this.newMapTextInput.current ?? undefined;
        if (newMapNameEl !== undefined) {
            const newMapName = newMapNameEl.value;
            if (newMapName.length > 0 && !this.props.ddsCollection.hasMap(newMapName)) {
                this.props.ddsCollection.addMap(newMapName);

                // clear
                newMapNameEl.value = "";
            }
        }
    }
}
