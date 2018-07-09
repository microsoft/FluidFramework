import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import { IAgent, IAgentUploader, IMessageSender } from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import { TmzLambda } from "./lambda";

export class TmzLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private messageSender: IMessageSender,
        private agentUploader: IAgentUploader,
        private tenantManager: services.TenantManager,
        private permissions: any) {
        super();

        // After a message queue error we need to recreate the lambda.
        this.messageSender.on("error", (error) => {
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        // Preps message sender.
        await this.messageSender.initialize().catch((error) => {
            winston.error(error);
        });
        // Preps agent uploader
        await this.initializeAgentUploader().catch((error) => {
            winston.error(error);
        });
        return new TmzLambda(
            this.messageSender,
            this.tenantManager,
            this.permissions,
            context);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }

    private async initializeAgentUploader() {
        await this.agentUploader.initialize();
        this.agentUploader.on("agentAdded", (agent: IAgent) => {
            if (agent.type === "server") {
                winston.info(`New agent package uploaded: ${agent.name}`);

                // Converting to webpacked scripts is disabled for now. Need to figure out an way to do it only once.
                // const moduleUrl = url.resolve(this.alfredUrl, `/agent/js/${agent.name}`);
                // request.post(moduleUrl);

                // Publishes to exchange.
                this.messageSender.sendAgent({
                    content: agent.name,
                    type: "agent:add",
                });
            } else if (agent.type === "client") {
                winston.info(`New agent script uploaded: ${agent.name}`);
                // TODO: Figure out an way to send this message to browser clients.
            }
        });
        this.agentUploader.on("agentRemoved", (agent: IAgent) => {
            if (agent.type === "server") {
                winston.info(`Agent package removed: ${agent.name}`);
                this.messageSender.sendAgent({
                    content: agent.name,
                    type: "agent:remove",
                });
            } else if (agent.type === "client") {
                winston.info(`Agent script removed`);
                // TODO: Figure out an way to send this message to browser clients.
            }
        });
        this.agentUploader.on("error", (err) => {
            // Do not reject on minio error since its not critical. Just report the error.
            winston.error(err);
        });
    }
}
