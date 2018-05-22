import { core } from "../client-api";

export interface IWork {
    /**
     * Starts the work
     */
    start(): Promise<void>;

    /**
     * Stops the work
     */
    stop(): Promise<void>;

    /**
     * Error event
     */
    on(event: "error", listener: (error: string) => void): this;
}

export interface IWorkManager {
    /**
     * Process a document work
     */
    processDocumentWork(tenantId: string, documentId: string, workType: string, action: string, token?: string):
        Promise<void>;

    /**
     * Process a new agent
     */
    processAgentWork(agentName: string, action: string);

    /**
     * Error event
     */
    on(event: "error", listener: (error: string) => void): this;
}

export interface IDocumentServiceFactory {

    getService(tenantId: string): Promise<core.IDocumentService>;
}
