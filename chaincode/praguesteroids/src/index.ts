import { IChaincode, IPlatform, IRuntime } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { PragueSteroids } from "./game-asteroids/app";

class PraguesteroidsPlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<T> {
        return null;
    }
}

class Runner {
    public async run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        this.start(runtime, platform).catch((error) => console.error(error));
        return new PraguesteroidsPlatform();
    }

    private async start(runtime: IRuntime, platform: IPlatform) {
        const collabDoc = await Document.Load(runtime);
        PragueSteroids.Start(collabDoc, platform);
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
