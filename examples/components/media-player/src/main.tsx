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

export const MediaPlayerName = "mediaPlayer";


/**
 * A component to allow you to add and manipulate components
 */
export class MediaPlayer extends PrimedComponent
    implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private static readonly factory = new PrimedComponentFactory(MediaPlayer, []);

    public static getFactory() {
        return MediaPlayer.factory;
    }

    protected async componentHasInitialized() {

    }

    public changeEditState(isEditable: boolean){
        this.root.set("isEditable", isEditable);
    }

    protected async componentInitializingFirstTime() {
        this.root.set("isEditable", true);
    }

    /**
     * Will return a new MediaPlayerView
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <MediaPlayerView
                root={this.root}
            />,
            div,
        );
    }

}

interface IMediaPlayerViewProps {
    root: ISharedDirectory;
}

interface IMediaPlayerViewState {
}

class MediaPlayerView extends React.Component<IMediaPlayerViewProps, IMediaPlayerViewState> {

    constructor(props: IMediaPlayerViewProps){
        super(props);
        props.root.on("valueChanged", (change, local) => {
            
        });
    }

    render(){
        

        return (
            <label>{"Hi"}</label>
        );
    }
}

export const fluidExport = MediaPlayer.getFactory();