/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ISharedMap, SharedMap, IDirectory } from "@fluidframework/map";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IMapProps, MapComponent } from "./map";

interface IDdsCollectionProps {
    mapDir: IDirectory;
    mapCreate: (name: string) => SharedMap;
}

interface IDdsCollectionState {
    maps: IMapProps[];
}

export class DdsCollectionComponent extends React.Component<IDdsCollectionProps, IDdsCollectionState> {
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
            {this.state.maps.map((map) => <MapComponent key={map.name} name={map.name} map={map.map}></MapComponent>)}
        </div>;
    }

    componentDidMount() {
        this.getMaps();
        this.props.mapDir.on("containedValueChanged", () => this.getMaps());
    }

    private getMaps(): void {
        this.getMapsCore().then(
            (maps) => this.setState({ maps }),
            (error) => console.log(error),
        );
    }

    private async getMapsCore(): Promise<IMapProps[]> {
        const maps: IMapProps[] = [];
        await Promise.all(Array.from(this.props.mapDir.keys()).map(async (name) => {
            const handle = await this.props.mapDir.wait<IFluidHandle<ISharedMap>>(name);
            if (handle !== undefined) {
                const map = await handle.get();
                maps.push({ name, map });
            }
        }));
        return maps.sort((a, b) => a.name.localeCompare(b.name));
    }

    private addMap(e: HTMLButtonElement) {
        const newMapNameEl = this.newMapTextInput.current ?? undefined;
        if (newMapNameEl !== undefined) {
            const newMapName = newMapNameEl.value;
            if (newMapName.length > 0 && this.props.mapDir.get(newMapName) === undefined) {
                const newMap = this.props.mapCreate(newMapName);
                newMap.bindToContext();
                this.props.mapDir.set(newMapName, newMap.handle);

                // clear
                newMapNameEl.value = "";
            }
        }
    }
}
