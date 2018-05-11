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
