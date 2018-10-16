import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as request from "request";
import { ITaskMessageSender } from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { RotographLambda } from "./lambda";

export class RotographLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private messageSender: ITaskMessageSender,
        private config: any) {
        super();

        this.messageSender.on("error", (error) => {
            // After a message queue error we need to recreate the lambda.
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {

        request.post(
            this.config.authEndpoint,
            {
                form: {
                    client_id: this.config.clientId,
                    client_secret: this.config.clientSecret,
                    grant_type: "client_credentials",
                    resource: this.config.resource,
                },
                headers: {
                    "content-type": "application/x-www-form-urlencoded",
                    "keep-alive": "true",
                },
            },
            (error, response, body) => {
                const parsedBody = JSON.parse(body);
                request.get(
                    this.config.endpoint + "/Assets",
                    {
                        auth: {
                            bearer: parsedBody.access_token,
                        },
                        headers: {
                            "Accept": "application/json",
                            "Content-Type": "application/json",
                            "DataServiceVersion": "3.0",
                            "MaxDataServiceVersion": "3.0",
                            "x-ms-version": "2.15",
                        },
                    },
                    (e, r, b) => {
                        console.log("Assets Retrieved");
                    },
                );
            },
        );

        return new RotographLambda(
            this.config.permissions,
            context);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}
