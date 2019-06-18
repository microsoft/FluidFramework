/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "liferaft" {
    import { EventEmitter } from "events";

    class Raft extends EventEmitter {
        public static states: string[];

        public state: string;

        public address: string;

        public socket: any;

        constructor(options: any);
        constructor(address: string, options: any);
        constructor(address: string, options?: any);

        public initialize(options: any);

        public write(packet, fn);

        public join(address: string);

        public command(value: any);
    }

    export = Raft;
}
