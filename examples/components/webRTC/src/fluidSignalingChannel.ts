import {IHostRuntime} from "@microsoft/fluid-runtime-definitions";

export class FluidSignalingChannel{

    constructor(private readonly containerRuntime: IHostRuntime){}

    public send(offer: any){
        this.containerRuntime
    }
}
