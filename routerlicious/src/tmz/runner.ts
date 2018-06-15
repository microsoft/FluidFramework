import * as request from "request";
import * as url from "url";
import * as winston from "winston";
import { IHelpMessage, IQueueMessage, ITenantManager } from "../api-core";
import { Deferred } from "../core-utils";
import * as utils from "../utils";
import * as messages from "./messages";

export class TmzRunner implements utils.IRunner {
    private deferred = new Deferred<void>();

    constructor(
        private alfredUrl: string,
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
                winston.info(`New module uploaded: ${agent.name}`);
                // Send help message.
                const moduleUrl = url.resolve(this.alfredUrl, `/agent/js/${agent.name}`);
                request.post(moduleUrl);
            } else if (agent.type === "client") {
                // winston.info(`Received a new webpacked script: ${agent.name}`);
                // TODO: Send help message.
            }
        });
        this.agentUploader.on("agentRemoved", (agent: messages.IAgent) => {
            if (agent.type === "server") {
                winston.info(`Module deleted: ${agent.name}`);
                // Send help message.
            } else if (agent.type === "client") {
                // TODO: Implement removal from client.
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
        const token = await this.tenantManager.getKey(tenantId);
        const queueMessage: IQueueMessage = {
            documentId,
            message,
            tenantId,
            token,
        };
        winston.info(`Help needed for ${tenantId}/${documentId}`);
        winston.info(JSON.stringify(queueMessage));
        // TODO: send message to queue
    }
}
