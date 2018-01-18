import * as assert from "assert";
import * as utils from "../../core-utils";
import { IContext } from "../../kafka-service/lambdas";

interface IWaitOffset {
    deferred: utils.Deferred<void>;
    value: number;
}

export class TestContext implements IContext {
    public offset: number = -1;
    private waits = new Array<IWaitOffset>();

    public checkpoint(offset: number) {
        assert(offset > this.offset);
        this.offset = offset;

        // Use filter to update the waiting array and also trigger the callback for those that are filtered out
        this.waits = this.waits.filter((wait) => {
            if (wait.value <= offset) {
                wait.deferred.resolve();
                return false;
            } else {
                return true;
            }
        });
    }

    public close(error: any, restart: boolean) {
        // TODO fill in implementation
    }

    public waitForOffset(value: number): Promise<void> {
        if (value <= this.offset) {
            return Promise.resolve();
        }

        const deferred = new utils.Deferred<void>();
        this.waits.push({ deferred, value });
        return deferred.promise;
    }
}
