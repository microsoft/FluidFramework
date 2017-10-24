export interface IWork {
    /**
     * Starts the work
     */
    start(): Promise<void>;

    /**
     * Stops the work
     */
    stop(): Promise<void>;
}
