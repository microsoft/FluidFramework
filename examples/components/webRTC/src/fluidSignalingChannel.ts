import { EventEmitter } from "events";
import {IHostRuntime, IInboundSignalMessage} from "@microsoft/fluid-runtime-definitions";
import { pkgName } from "./packageVersion";
import { IEmitter, IEvent, IErrorEvent } from "./events";

export interface IOfferEvent extends IEvent{
    (event: "offer", listener: (clientId: string, offer: RTCSessionDescription) => void);
}

export interface IAnswerEvent extends IEvent{
    (event: "answer", listener: (clientId: string, answer: any) => void);
}

export interface ISignalingChannel extends IEmitter<IOfferEvent & IAnswerEvent & IErrorEvent>{
    send(offer: any);
}


export class FluidSignalingChannel extends EventEmitter implements ISignalingChannel{

    public static create(containerRuntime: IHostRuntime): ISignalingChannel{
        return new FluidSignalingChannel(containerRuntime);
    }

    private constructor(private readonly containerRuntime: IHostRuntime){
        super();
        this.containerRuntime.on("signal",(msg: IInboundSignalMessage, local: boolean)=>{
            if(!local){
                if(msg.type === pkgName){
                    if(msg.content.offer !== undefined){
                        this.emit("offer", msg.clientId, msg.content as RTCSessionDescription);
                    } else if(msg.content.answer !== undefined){
                        this.emit("answer", msg.clientId, msg.content);
                    } else{
                        this.emit("error", `unknown signal type from ${msg.clientId}`);
                    }

                }
            }
        });
    }

    public send(offer: RTCSessionDescription){
        this.containerRuntime.submitSignal(pkgName, {offer});
    }
}
