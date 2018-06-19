import * as winston from "winston";
import { IHelpMessage, IQueueMessage, ITenantManager } from "../api-core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import * as messages from "./messages";

export class TmzRunner implements utils.IRunner {
    private deferred = new Deferred<void>();

    constructor(
        alfredUrl: string,
        private agentUploader: messages.IAgentUploader,
        private messageSender: messages.IMessageSender,
        private tenantManager: ITenantManager) {
    }

    public async start(): Promise<void> {
        // Preps message sender.
        await this.messageSender.initialize().catch((err) => {
            this.deferred.reject(err);
        });
        this.messageSender.on("error", (err) => {
            this.deferred.reject(err);
        });

        // Preps and start listening to agent uploader.
        this.agentUploader.initialize();
        this.agentUploader.on("agentAdded", (agent: messages.IAgent) => {
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
        this.agentUploader.on("agentRemoved", (agent: messages.IAgent) => {
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

        return this.deferred.promise;
    }

    public stop(): Promise<void> {
        winston.info("Stop requested");
        return this.deferred.promise;
    }

    public async trackDocument(tenantId: string, documentId: string, message: IHelpMessage): Promise<void> {
        const key = await this.tenantManager.getKey(tenantId);
        const queueMessage: IQueueMessage = {
            documentId,
            message,
            tenantId,
            token: utils.generateToken(tenantId, documentId, key),
        };
        winston.info(`Tasks requested for ${tenantId}/${documentId}: ${JSON.stringify(message.tasks)}`);
        this.messageSender.sendTask({
            content: queueMessage,
            type: "tasks:start",
        });
    }
}
