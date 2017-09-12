/**
 * A runner represents a task that starts once start is called. And ends when either start completes
 * or stop is called.
 */
export interface IRunner {
    /**
     * Starts the runner
     */
    start(): Promise<void>;

    /**
     * Stops the runner
     */
    stop(): Promise<void>;
}
