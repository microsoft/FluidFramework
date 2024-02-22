"use strict";
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypedEventEmitter = void 0;
// False positive: this is an import from the `events` package, not from Node.
// eslint-disable-next-line unicorn/prefer-node-protocol
const events_1 = require("events");
/**
 * Event Emitter helper class the supports emitting typed events
 * @public
 */
class TypedEventEmitter extends events_1.EventEmitter {
    constructor() {
        super();
        this.addListener = super.addListener.bind(this);
        this.on = super.on.bind(this);
        this.once = super.once.bind(this);
        this.prependListener = super.prependListener.bind(this);
        this.prependOnceListener = super.prependOnceListener.bind(this);
        this.removeListener = super.removeListener.bind(this);
        this.off = super.off.bind(this);
    }
}
exports.TypedEventEmitter = TypedEventEmitter;
//# sourceMappingURL=typedEventEmitter.js.map