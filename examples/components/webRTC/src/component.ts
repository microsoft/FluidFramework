/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent, PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { IComponentRuntime, IComponentContext } from "@microsoft/fluid-runtime-definitions";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { FluidRtcPeerConnectionManager } from "./peerConnectionManager";


const videoHeight=200;
const videoDivHeightString = `${videoHeight}px`;

export class WebRTCComponent extends PrimedComponent implements IComponentHTMLView {
    public get IComponentHTMLView() { return this; }

    private readonly streamMap = new Map<string, MediaStream>();

    constructor(runtime: IComponentRuntime, context: IComponentContext){
        super(runtime, context);
    }

    protected async componentHasInitialized(){
        const video: MediaTrackConstraints={
            aspectRatio:1,
            height: videoHeight,
            facingMode: {exact: "user"},
        };
        const audio: MediaTrackConstraints={
            echoCancellation:true,
            noiseSuppression: true,
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia({video, audio});
        this.streamMap.set("local", await navigator.mediaDevices.getUserMedia({video, audio: false}));

        FluidRtcPeerConnectionManager.emitter.on("connected", (clientId) =>{
            this.renderClients(clientId);
        });
        FluidRtcPeerConnectionManager.emitter.on("track", (clientId, track) =>{
            const remoteStream = this.streamMap.get(clientId) ?? new MediaStream();
            this.streamMap.set(clientId, remoteStream);
            remoteStream.addTrack(track);
        });
        FluidRtcPeerConnectionManager.emitter.on("closed", (clientId) =>{
            this.streamMap.delete(clientId);
            this.renderClients(clientId);
        });

        await FluidRtcPeerConnectionManager.Initialize(this.context, mediaStream);

    }
    private savedDiv: HTMLElement | undefined;
    public render(div: HTMLElement) {
        const myDiv = document.createElement("div");
        myDiv.style.display="flex";
        myDiv.style.justifyContent="center";
        myDiv.style.overflowY="hidden";
        myDiv.style.height=videoDivHeightString;
        myDiv.style.maxHeight=videoDivHeightString;

        myDiv.style.overflowX="auto";
        myDiv.style.maxWidth="100vw";
        myDiv.style.width = "100%";

        div.appendChild(myDiv);
        if(this.savedDiv === undefined){
            this.savedDiv = myDiv;
        } else {
            this.savedDiv.remove();
            this.savedDiv = myDiv;
        }
        this.renderClients(... this.streamMap.keys());
    }

    private readonly viewId = uuid();
    private renderClients(... clientIds: string[]){
        if(this.savedDiv !== undefined){

            for(const clientId of clientIds){
                const elementId = `${this.id}${this.viewId}-${clientId}`;
                const element = document.getElementById(elementId);
                const remoteStream = this.streamMap.get(clientId);
                if(remoteStream !== undefined){
                    // eslint-disable-next-line no-null/no-null
                    if(element === null){
                        const video = document.createElement("video");
                        video.srcObject = remoteStream;
                        video.height = videoHeight;
                        video.controls=true;
                        video.id = elementId;
                        this.savedDiv.appendChild(video);
                        video.play().catch((error) => console.error(error));
                        video.muted = true;
                    }
                // eslint-disable-next-line no-null/no-null
                }else if(element !== null){
                    element.remove();
                }
            }
        }
    }
}

export const factory = new PrimedComponentFactory(WebRTCComponent);
