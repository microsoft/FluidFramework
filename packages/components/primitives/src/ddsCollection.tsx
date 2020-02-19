/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import { ISharedMap, SharedMap, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { IMapProps, MapComponent } from "./map";

interface IDdsCollectionProps {
    mapDir: IDirectory;
    mapCreate: (name: string) => SharedMap;
    listenValueChanged: (listener: (changed: IDirectoryValueChanged) => void) => void;
}

interface IDdsCollectionState {
    maps: IMapProps[];
}

export class DdsCollectionComponent extends React.Component<IDdsCollectionProps, IDdsCollectionState> {
    constructor(props: IDdsCollectionProps) {
        super(props);
        this.state = { maps: [] };
    }

    public render() {
        return <div>
            <div>
                <span>
                    <input type="text"></input>
                    <button onClick={(e) => this.addMap(e.currentTarget)}>Add Map</button>
                </span>
            </div>
            {this.state.maps.map((map) => <MapComponent key={map.name} name={map.name} map={map.map}></MapComponent>)}
        </div>;
    }

    componentDidMount() {
        this.getMaps();
        this.props.listenValueChanged(() => this.getMaps());
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
            const handle = await this.props.mapDir.wait<IComponentHandle>(name);
            if (handle !== undefined) {
                const map = await handle.get<ISharedMap>();
                maps.push({ name, map });
            }
        }));
        return maps;
    }

    private addMap(e: HTMLButtonElement) {
        const newMapEl = e.previousElementSibling as HTMLInputElement;
        const newMapName = newMapEl?.value ?? undefined;
        if (newMapName !== undefined && newMapName.length > 0) {
            if (this.props.mapDir.get(newMapName) === undefined) {
                const newMap = this.props.mapCreate(newMapName);
                newMap.register();
                this.props.mapDir.set(newMapName, newMap.handle);

                // clear
                newMapEl.value = "";
            }
        }
    }
}
