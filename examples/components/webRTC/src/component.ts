/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent, PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { IComponentRuntime, IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { FluidRtcPeerConnectionManager } from "./peerConnectionManager";


export class WebRTCComponent extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private readonly streamMap = new Map<string, MediaStream>();

    constructor(runtime: IComponentRuntime, context: IComponentContext){
        super(runtime, context);
    }

    protected async componentHasInitialized(){
        const video: MediaTrackConstraints={
            aspectRatio:1,
            height:200,
            facingMode: {exact: "user"},
        };
        const audio: MediaTrackConstraints={
            echoCancellation:true,
            noiseSuppression: true,
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia({video, audio});
        this.streamMap.set("local", await navigator.mediaDevices.getUserMedia({video, audio: false}));

        FluidRtcPeerConnectionManager.emitter.on("connected", (clientId) =>{
            this.realRender(clientId);
        });
        FluidRtcPeerConnectionManager.emitter.on("track", (clientId, track) =>{
            const remoteStream = this.streamMap.get(clientId) ?? new MediaStream();
            this.streamMap.set(clientId, remoteStream);
            remoteStream.addTrack(track);
        });
        FluidRtcPeerConnectionManager.emitter.on("closed", (clientId) =>{
            this.streamMap.delete(clientId);
            this.realRender(clientId);
        });

        await FluidRtcPeerConnectionManager.Initialize(this.context, mediaStream);

    }
    private savedDiv: HTMLElement | undefined;
    public render(div: HTMLElement) {
        const myDiv = document.createElement("div");
        myDiv.style.maxWidth="100vw";
        myDiv.style.maxHeight="100vh";
        div.appendChild(myDiv);
        if(this.savedDiv === undefined){
            this.savedDiv = myDiv;
        } else {
            this.savedDiv.remove();
            this.savedDiv = myDiv;
        }
        this.realRender(... this.streamMap.keys());
    }

    private realRender(... clientIds: string[]){
        if(this.savedDiv !== undefined){
            for(const clientId of clientIds){
                const elementId = `${this.id}-${clientId}`;
                const element = document.getElementById(elementId);
                const remoteStream = this.streamMap.get(clientId);
                if(remoteStream !== undefined){
                    // eslint-disable-next-line no-null/no-null
                    if(element === null){
                        const media = document.createElement("video");
                        media.id = elementId;
                        media.srcObject = remoteStream;
                        media.style.display="inline-block";
                        media.style.float="left";
                        media.style.maxHeight="100%";
                        media.style.maxWidth="100%";
                        media.controls=true;
                        this.savedDiv.appendChild(media);
                        media.play();
                    }
                // eslint-disable-next-line no-null/no-null
                }else if(element !== null){
                    this.savedDiv.removeChild(element);
                }
            }
        }
    }
}

export const factory = new PrimedComponentFactory(WebRTCComponent);
