import * as assert from "assert";
import { EventEmitter } from "events";
import { IContext } from "../kafka-service/lambdas";

export class DocumentContext implements IContext {
    private events = new EventEmitter();
    private offsetInternal: number;
    private maxOffsetInternal: number;

    public get maxOffset(): number {
        return this.maxOffsetInternal;
    }

    public get offset(): number {
        return this.offsetInternal;
    }

    public setMaxOffset(offset: number) {
        assert(this.maxOffset === undefined || offset > this.maxOffset);
        this.maxOffsetInternal = offset;
    }

    public checkpoint(offset: number) {
        assert(this.offsetInternal === undefined || offset > this.offsetInternal);
        if (this.offsetInternal !== offset) {
            // Need to broadcast to some context manager that it changed and should eval whether it can propagate
            this.offsetInternal = offset;
            this.events.emit("checkpoint", this);
        }
    }

    public error(error: any, restart: boolean) {
        // TODO implement close
    }

    public addListener(event: "checkpoint", callback: (...args: any[]) => void)
    public addListener(event: string, callback: (...args: any[]) => void) {
        this.events.on(event, callback);
    }
}
