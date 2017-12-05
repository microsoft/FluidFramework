import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new DocumentLambda(config.get("documentLambda"), context);
    }
}
