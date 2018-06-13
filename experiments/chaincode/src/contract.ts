import { ChaincodeReponse, error as shimError, Stub, success } from "fabric-shim";

export interface IChaincode {
    Init(stub): Promise<ChaincodeReponse>;
    Invoke(stub): Promise<ChaincodeReponse>;
}

export class Contract implements IChaincode {
    public async Init(stub: Stub): Promise<ChaincodeReponse> {
        console.log("Hey! Someone asked me to Init!");

        const args = stub.getStringArgs();
        if (args.length !== 2) {
            return shimError("Incorrect arguments. Expecting a key and a value");
        }

        const [key, value] = args;
        console.log(`Key-Value: ${key} ${value}`);
        await stub.putState(key, Buffer.from(value));

        return success();
    }

    public async Invoke(stub: Stub): Promise<ChaincodeReponse> {
        console.log("Hey! I'm being invoked!");
        const { fcn, params } = stub.getFunctionAndParameters();
        console.log(`${fcn} ${JSON.stringify(params)}`);

        let result: Buffer;
        switch (fcn) {
            case "get":
                result = await this.getKey(stub, params);
                break;
            case "set":
                result = await this.setKey(stub, params);
                break;
            default:
                console.log("I hit a default block");
                return shimError("Unknown function call");
        }

        return success(result);
    }

    private async getKey(stub: Stub, params: string[]): Promise<Buffer> {
        if (params.length !== 1) {
            return Promise.reject("Invalid argument length to get");
        }

        const buffer = await stub.getState(params[0]);
        if (!buffer) {
            return Promise.reject("Asset not found");
        }

        return buffer;
    }

    private async setKey(stub: Stub, params: string[]): Promise<Buffer> {
        console.log("I'm in setKey");
        if (params.length !== 2) {
            return Promise.reject("Invalid argument length to put");
        }

        const valueAsBuffer = Buffer.from(params[1]);
        console.log("Doing a putState");
        return stub.putState(params[0], valueAsBuffer).then(
            () => {
                console.log("That worked!");
                return valueAsBuffer;
            },
            (error) => {
                console.log(error);
                return Promise.reject(error);
            });
    }
}
