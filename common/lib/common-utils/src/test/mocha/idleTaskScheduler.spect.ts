/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { scheduleIdleTask } from "../../idleTaskScheduler";

describe("Idle task scheduler", () => {
    describe("", () => {
        function demo(x: number): void{
            console.log(x);

              if (x < 21){
                console.log("errror")
                throw new Error("Something awful happened");
              };
        }

        it("Should schedule and run a synchronous task during idle time", () => {
            scheduleIdleTask(() =>{demo(4)}, 1000).then(() => {
                console.log("success");
              }).catch((err) => {
                console.log("Smth went wrong");
              })
        });
    });


});
