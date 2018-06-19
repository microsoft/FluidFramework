import { core } from "../client-api";

export interface IWork {
    /**
     * Starts the work
     */
    start(task: string): Promise<void>;

    /**
     * Stops the work
     */
    stop(task: string): Promise<void>;

    /**
     * "error" and "stop" listener
     */
    on(event: "stop" | "error", listener: (error: any) => void): this;
}

export interface IWorkManager {
    /**
     * Starts working on a document
     */
    startDocumentWork(tenantId: string, documentId: string, workType: string, token?: string):
        Promise<void>;

    /**
     * Stops working on a document
     */
    stopDocumentWork(tenantId: string, documentId: string, workType: string): void;

    /**
     * Loads a new agent
     */
    loadAgent(agentName: string): Promise<void>;

    /**
     * Unloads an existing agent
     */
    unloadAgent(agentName: string): void;

    /**
     * Error event
     */
    on(event: "error", listener: (error: string) => void): this;
}

export interface IDocumentServiceFactory {

    getService(tenantId: string): Promise<core.IDocumentService>;
}

export interface ITaskRunnerConfig {

    type: string;

    permission: string[];
}

export interface IDocumentTaskInfo {

    tenantId: string;

    docId: string;

    task: string;
}
