import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { ScribeLambda } from "./lambda";

export class ScribeLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new ScribeLambda(context);
    }

    public async dispose(): Promise<void> {
        return;
    }
}
