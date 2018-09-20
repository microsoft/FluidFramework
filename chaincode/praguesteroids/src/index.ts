import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { Document } from "./document";
import { PragueSteroids } from "./game-asteroids/app";

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
        PragueSteroids.Start(collabDoc, platform);
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
