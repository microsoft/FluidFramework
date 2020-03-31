/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { FluidRtcSignalingChannel, IFluidRtcSignalingChannel } from "./signalingChannel";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class FluidRtcPeerConnectionManager{

    private static readonly clientConnections = new Map<string, RTCPeerConnection>();

    public static async Initialize(context: IComponentContext){
        const signalingClient = FluidRtcSignalingChannel.create(context.hostRuntime);

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        signalingClient.on("offer", async (fromClientId: string, offer)=>{
            if(!this.clientConnections.has(fromClientId)){
                const peerCon = this.createPeerConnection(fromClientId, signalingClient);
                await peerCon.setRemoteDescription(new RTCSessionDescription(offer));
                const answer = await peerCon.createAnswer();
                await peerCon.setLocalDescription(answer);
                signalingClient.sendAnswer(fromClientId, answer);
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        signalingClient.on("answer", async (fromClientId, answer)=>{
            const peerCon = this.clientConnections.get(fromClientId);
            if (peerCon !== undefined){
                await peerCon.setRemoteDescription(answer);
            }
        });

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        signalingClient.on("iceCandidate", async (fromClientId: string, iceCandidate)=>{
            const peerCon = this.clientConnections.get(fromClientId);
            if(peerCon !== undefined){
                await peerCon.addIceCandidate(iceCandidate);
            }
        });

        const audience = context.hostRuntime.getAudience();

        audience.on("removeMember",(clientId)=>{
            const peerCon = this.clientConnections.get(clientId);
            if(peerCon !== undefined){
                peerCon.close();
                this.clientConnections.delete(clientId);
            }
        });

        const offers: [string, RTCSessionDescriptionInit][] = [];
        for(const memberClientId of audience.getMembers().keys()){
            if(memberClientId !== context.clientId && !this.clientConnections.has(memberClientId)){
                const peerCon = this.createPeerConnection(memberClientId, signalingClient);
                const offer = await peerCon.createOffer();
                await peerCon.setLocalDescription(offer);
                offers.push([memberClientId, offer]);
            }
        }
        if(offers.length > 0){
            signalingClient.sendOffers(... offers);
        }
    }

    private static createPeerConnection(toClientId: string, signalingChannel: IFluidRtcSignalingChannel){
        const configuration = {iceServers: [{urls: "stun:stun.l.google.com:19302"}]};
        const peerCon = new RTCPeerConnection(configuration);
        this.clientConnections.set(toClientId, peerCon);
        peerCon.addEventListener("icecandidate", (ev) => signalingChannel.sendIceCandidate(toClientId, ev.candidate));
        peerCon.addEventListener("connectionstatechange",(ev)=>{
            if(peerCon.connectionState === "closed"){
                this.clientConnections.delete(toClientId);
            }
        });
        return peerCon;
    }
}
