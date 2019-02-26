import { IDocumentService, IHost } from "@prague/container-definitions";

export interface IWork {
    /**
     * Starts the work
     */
    start(task: string): Promise<void>;

    /**
     * Stops the work
     */
    stop(): Promise<void>;

    /**
     * "error" and "stop" listener
     */
    on(event: "stop" | "error", listener: (event: any) => void): this;

    /**
     * Remove event listeners
     */
    removeListeners(): void;
}

export interface IWorkManager {
    /**
     * Starts working on a document
     */
    startDocumentWork(
        tenantId: string,
        documentId: string,
        workType: string,
        tokenProvider: IHost): Promise<void>;

    /**
     * Stops working on a document
     */
    stopDocumentWork(tenantId: string, documentId: string, workType: string): Promise<void>;

    /**
     * Loads a new agent
     */
    loadAgent(agentName: string): Promise<void>;

    /**
     * Unloads an existing agent
     */
    unloadAgent(agentName: string): void;

    /**
     * Error event or stop event.
     */
    on(event: "error" | "stop", listener: (event: any) => void): this;
}

export interface IDocumentServiceFactory {

    getService(tenantId: string): Promise<IDocumentService>;
}

export interface IDocumentTaskInfo {

    tenantId: string;

    docId: string;

    task: string;
}
