import { EventEmitter } from "events";
import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { TmzLambda } from "./lambda";
import { TmzRunner } from "./runner";
import { TmzResources } from "./runnerFactory";

export class TmzLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    private stopRequested = false;
    private runningP: Promise<void>;

    constructor(private resources: TmzResources, private runner: TmzRunner, running: Promise<void>) {
        super();

        // If the service stops we need to signal the error across contexts
        this.runningP = running.then(
            () => this.stopRequested ? Promise.resolve() : Promise.reject("TMZ has unexpectedly stopped"));
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new TmzLambda(context, this.runner, this.runningP);
    }

    public async dispose(): Promise<void> {
        this.stopRequested = true;
        await this.runner.stop();
        await this.resources.dispose();
    }
}
