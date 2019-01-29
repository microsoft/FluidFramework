import { IChaincodeComponent, IChaincodeHost, IContext, IHostRuntime } from "@prague/container-definitions";
import { IPlatform } from "@prague/runtime-definitions";
import { debug } from "./debug";
import { instantiateComponent as ic } from "./legacy1";
import * as rootComponent from "./legacy1";
import * as testComponent from "./legacy2";
import * as counter from "./legacyCounter";
import { MyPlatform } from "./legacyPlatform";

class MyChaincodeHost implements IChaincodeHost {
    public async getModule(type: string) {
        debug(`getModule ${type}`);

        switch (type) {
            case "@chaincode/counter":
                return counter;
            case "@prague/root-component":
                return rootComponent;
            case "@prague/test-component":
                return testComponent;
            default:
                return Promise.reject("Unknown component");
        }
    }

    public async close(): Promise<void> {
        debug("close");
        return;
    }

    // I believe that runtime needs to have everything necessary for this thing to actually load itself once this
    // method is called
    public async run(context: IContext): Promise<IPlatform> {
        // debug(`MyChaincodeHost ${runtime.existing ? "" : "NOT"} existing document`);
        // this.doWork(runtime).catch((error) => {
        //     runtime.error(error);
        // });

        return new MyPlatform();
    }

    public async doWork(runtime: IHostRuntime) {
        if (!runtime.existing) {
            await runtime.createAndAttachProcess("counter", "@chaincode/counter");
        } else {
            await runtime.getProcess("counter");
        }
    }
}

export async function instantiateComponent(): Promise<IChaincodeComponent> {
    return ic();
}

export async function instantiateHost(): Promise<IChaincodeHost> {
    return new MyChaincodeHost();
}
