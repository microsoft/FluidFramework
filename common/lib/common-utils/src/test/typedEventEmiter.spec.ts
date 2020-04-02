import * as assert from "assert";
import { IErrorEvent } from "@microsoft/fluid-common-definitions";
import { TypedEventEmiter } from "../typedEventEmitter";

describe("TypedEventEmiter", () => {
    it("Validate Function proxies",()=>{
        const tee = new TypedEventEmiter<IErrorEvent>();
        let once = 0;

        tee.once("error",() => once++);
        assert.equal(tee.listenerCount("error"), 1);

        let on = 0;
        tee.on("error",() => on++);
        assert.equal(tee.listenerCount("error"), 2);

        for(let i=0;i<5;i++){
            tee.emit("error","message");
        }

        assert.equal(once, 1);
        assert.equal(on, 5);
    });
});
