/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { EventEmitter } from "events";
import {IHostRuntime, IInboundSignalMessage} from "@microsoft/fluid-runtime-definitions";
import { pkgName } from "./packageVersion";
import { IEmitter, IErrorEvent  } from "./events";

interface IFluidRtcSignalingChannelEvents extends IErrorEvent {
    (event: "answer", listener: (fromClientId: string, answer: RTCSessionDescriptionInit) => void);
    (event: "offer", listener: (fromClientId: string, offer: RTCSessionDescriptionInit) => void)
    (event: "iceCandidate", listener: (fromClientId: string, iceCandidate: RTCIceCandidate) => void);
}

export interface IFluidRtcSignalingChannel extends IEmitter<IFluidRtcSignalingChannelEvents>{
    sendOffers(... offers: [string, RTCSessionDescriptionInit][]);
    sendAnswer(clientId: string, answer: RTCSessionDescriptionInit);
    sendIceCandidate(clientId: string, iceCandidate: RTCIceCandidate | null);
}

export class FluidRtcSignalingChannel extends EventEmitter implements IFluidRtcSignalingChannel{

    public static create(containerRuntime: IHostRuntime): IFluidRtcSignalingChannel{
        return new FluidRtcSignalingChannel(containerRuntime);
    }

    private constructor(private readonly containerRuntime: IHostRuntime){
        super();
        this.containerRuntime.on("signal",(msg: IInboundSignalMessage, local: boolean)=>{
            if(!local && this.containerRuntime.clientId !== undefined){
                if(msg.type === pkgName){
                    if(msg.content.offers !== undefined){
                        const offers = new Map(msg.content.offers as [string, RTCSessionDescriptionInit][]);
                        if(offers.has(this.containerRuntime.clientId)){
                            this.emit("offer", msg.clientId, offers.get(this.containerRuntime.clientId));
                        }
                    } else if(msg.content.answer !== undefined){
                        if(msg.content.clientId === this.containerRuntime.clientId){
                            this.emit("answer", msg.clientId, msg.content.answer);
                        }
                    } else if(msg.content.iceCandidate !== undefined){
                        if(msg.content.clientId === this.containerRuntime.clientId){
                            this.emit("iceCandidate", msg.clientId, msg.content.iceCandidate);
                        }
                    }else{
                        this.emit("error", `unknown signal type from ${msg.clientId}`);
                    }
                }
            }
        });
    }

    public sendOffers(... offers: [string, RTCSessionDescriptionInit][]){
        if(offers.length > 0){
            this.containerRuntime.submitSignal(pkgName, {offers});
        }
    }
    public sendAnswer(clientId: string, answer: RTCSessionDescriptionInit){
        this.containerRuntime.submitSignal(pkgName, {clientId, answer});
    }

    public sendIceCandidate(clientId: string, iceCandidate: RTCIceCandidate | null){
        // eslint-disable-next-line no-null/no-null
        if(iceCandidate !== null){
            this.containerRuntime.submitSignal(pkgName, {clientId, iceCandidate});
        }
    }
}
