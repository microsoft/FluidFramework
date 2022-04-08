/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import { ISharedMap } from "@fluidframework/map";

export interface IMapProps {
    name: string;
    map: ISharedMap;
}

interface IMapState {
    keys: string[];
}

export class MapView extends React.Component<IMapProps, IMapState> {
    protected readonly newEntryKeyTextInput = React.createRef<HTMLInputElement>();
    protected readonly newEntryValueTextInput = React.createRef<HTMLInputElement>();

    constructor(props: IMapProps) {
        super(props);

        this.state = {
            keys: Array.from(this.props.map.keys()),
        };

        this.props.map.on("valueChanged", (changed) => {
            // add
            if (changed.previousValue === undefined) {
                this.refresh();
                return;
            }

            // delete
            const newValue = this.props.map.get(changed.key);
            if (newValue === undefined) {
                this.refresh();
            }
        });
    }

    public render() {
        return <div>
            <h1>{this.props.name}</h1>
            {this.state.keys.map((key) =>
                <MapEntryView key={key} map={this.props.map} mapKey={key}></MapEntryView>,
            )}
            <span>
                <input type="text" ref={this.newEntryKeyTextInput}></input>
                <input type="text" ref={this.newEntryValueTextInput}></input>
                <button onClick={(e) => this.addMapKey(e.currentTarget)}>Add Entry</button>
            </span>
        </div>;
    }

    private refresh() {
        this.setState({ keys: Array.from(this.props.map.keys()).sort() });
    }

    private addMapKey(e: HTMLButtonElement) {
        const newKeyEl = this.newEntryKeyTextInput.current ?? undefined;
        const newValueEl = this.newEntryValueTextInput.current ?? undefined;

        if (newKeyEl !== undefined && newValueEl !== undefined && newKeyEl.value.length > 0) {
            const valueText = newValueEl.value ?? "";
            this.props.map.set(newKeyEl.value, valueText);

            // clear
            newKeyEl.value = "";
            newValueEl.value = "";
        }
    }
}

interface IMapEntryProps {
    mapKey: string;
    map: ISharedMap;
}

interface IMapEntryState {
    mapValue: string;
}

export class MapEntryView extends React.Component<IMapEntryProps, IMapEntryState> {
    constructor(props: IMapEntryProps) {
        super(props);

        this.state = {
            mapValue: this.props.map.get(this.props.mapKey) ?? "",
        };

        this.props.map.on("valueChanged", (changed) => {
            if (changed.key === this.props.mapKey) {
                this.setState({ mapValue: this.props.map.get(this.props.mapKey) ?? "" });
            }
        });
    }

    public render() {
        return <div>
            <span>
                <span>{this.props.mapKey}</span>
                <input type="text" onChange={(e) => this.changeValue(e.currentTarget)} value={this.state.mapValue}>
                </input>
                <button onClick={() => this.removeEntry()}>Remove Entry</button>
            </span>
        </div>;
    }

    private changeValue(newValue: HTMLInputElement) {
        this.props.map.set(this.props.mapKey, newValue.value ?? "");
    }

    private removeEntry() {
        this.props.map.delete(this.props.mapKey);
    }
}
