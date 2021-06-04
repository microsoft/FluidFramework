/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IErrorEvents, IEventProvider } from '@fluidframework/runtime-definitions';
import { expectAssignable, expectError, expectType } from 'tsd';
import { IEventEmitter, TypedEventEmitter } from "../../../dist";

interface ITestEvents {
    alert: [message: string, counts?: number[]];
    ping: [];
    bad(): void;
    alsoBad: number;
}

class TestEmitter extends TypedEventEmitter<ITestEvents> {
    test(): void {
        // Verify listeners
        this.on("alert", (message, counts) => {
            expectType<string>(message);
            expectType<number[] | undefined>(counts);
        });
        this.once("alert", (message) => {
            expectType<string>(message);
        });
        expectError(this.on("alert", (x: number) => {
            // should fail with wrong type arg
        }));
        this.off("bad", (args) => {
            expectType<never>(args);
        });
        this.prependListener("alsoBad", (args) => {
            expectType<never>(args);
        });
        this.prependOnceListener("ping", () => {
            // do nothing
        });
        expectError(this.prependOnceListener("alert", (message, counts, extra) => {
            // too many args
        }));

        // Verify emitters
        this.emit("alert", "received a ping", [1, 2]);
        this.emit("alert", "received a ping");
        expectError(this.emit("alert", 1));
        this.emit("ping");
        this.emit("bad");
        this.emit("alsoBad");

        // Verify listener events
        this.on("newListener", (event, listener) => {
            expectType<keyof ITestEvents>(event);
            expectAssignable<CallableFunction>(listener);
        });
        expectError(this.on("newListener", (event, listener, extra) => {
            // too many args
        }));
        this.on("removeListener", (event, listener) => {
            expectType<keyof ITestEvents>(event);
            expectAssignable<CallableFunction>(listener);
        });
        expectError(this.on("removeListener", (event, listener, extra) => {
            // too many args
        }));

        this.on("error", (error) => {
            expectType<any>(error);
        });
        expectError(this.on("error", (error, extra) => {
            // too many args
        }));
    }
}

// Verify contracts are met
expectAssignable<IEventProvider<ITestEvents>>(new TestEmitter());
expectAssignable<IEventEmitter<ITestEvents>>(new TestEmitter());

// Verify external emitter
export function testConcreteTypes(emitter: TestEmitter) {
    // Verify listeners
    emitter.on("alert", (message, counts) => {
        expectType<string>(message);
        expectType<number[] | undefined>(counts);
    });
    emitter.once("alert", (message) => {
        expectType<string>(message);
    });
    expectError(emitter.on("alert", (x: number) => {
        // should fail with wrong type arg
    }));
    emitter.off("bad", (args) => {
        expectType<never>(args);
    });
    emitter.prependListener("alsoBad", (args) => {
        expectType<never>(args);
    });
    expectError(emitter.once("reallyBad", (args) => {
        // should fail
    }));
    emitter.prependOnceListener("ping", () => {
        // do nothing
    });
    expectError(emitter.prependOnceListener("alert", (message, counts, extra) => {
        // too many args
    }));

    // Verify emitters
    emitter.emit("alert", "received a ping", [1, 2]);
    emitter.emit("alert", "received a ping");
    expectError(emitter.emit("alert", 1));
    emitter.emit("ping");
    emitter.emit("bad");
    emitter.emit("alsoBad");
    expectError(emitter.emit("reallyBad"));

    // Verify listener events
    emitter.on("newListener", (event, listener) => {
        expectType<keyof ITestEvents>(event);
        expectAssignable<CallableFunction>(listener);
    });
    expectError(emitter.on("newListener", (event, listener, extra) => {
        // too many args
    }));
    emitter.on("removeListener", (event, listener) => {
        expectType<keyof ITestEvents>(event);
        expectAssignable<CallableFunction>(listener);
    });
    expectError(emitter.on("removeListener", (event, listener, extra) => {
        // too many args
    }));

    emitter.on("error", (error) => {
        expectType<any>(error);
    });
    expectError(emitter.on("error", (error, extra) => {
        // too many args
    }));
}

// Verify external emitter interface
export function testContractTypes(emitter: IEventProvider<ITestEvents>) {
    // Verify listeners
    emitter.on("alert", (message, counts) => {
        expectType<string>(message);
        expectType<number[] | undefined>(counts);
    });
    emitter.once("alert", (message) => {
        expectType<string>(message);
    });
    expectError(emitter.on("alert", (x: number) => {
        // should fail with wrong type arg
    }));
    emitter.off("bad", (args) => {
        expectType<never>(args);
    });
    emitter.prependListener("alsoBad", (args) => {
        expectType<never>(args);
    });
    expectError(emitter.once("reallyBad", (args) => {
        // should fail
    }));
    emitter.prependOnceListener("ping", () => {
        // do nothing
    });
    expectError(emitter.prependOnceListener("alert", (message, counts, extra) => {
        // too many args
    }));

    // Verify emitters NOT ALLOWED ON PROVIDER
    expectError(emitter.emit("alert", "received a ping", [1, 2]));
    expectError(emitter.emit("alert", "received a ping"));
    expectError(emitter.emit("alert", 1));
    expectError(emitter.emit("ping"));
    expectError(emitter.emit("bad"));
    expectError(emitter.emit("alsoBad"));
    expectError(emitter.emit("reallyBad"));

    // Verify listener events NOT ALLOWED ON PROVIDER
    expectError(emitter.on("newListener", (event, listener) => {
        // not allowed
    }));
    expectError(emitter.on("newListener", (event, listener, extra) => {
        // too many args
    }));
    expectError(emitter.on("removeListener", (event, listener) => {
        // not allowed
    }));
    expectError(emitter.on("removeListener", (event, listener, extra) => {
        // too many args
    }));

    expectError(emitter.on("error", (error) => {
        // should fail because ITestEvents doesn't extend IErrorEvents
    }));
    expectError(emitter.on("error", (error, extra) => {
        // too many args
    }));
}

interface IBaseEvents extends IErrorEvents {
    base: [b: boolean];
}

interface IExtendedEvents extends IBaseEvents {
    extended: [n: number];
}

class ExtendableEmitter<T extends IBaseEvents> extends TypedEventEmitter<T> {
    public test() {
        expectAssignable<IEventProvider<IBaseEvents>>(this);
        expectAssignable<IEventProvider<T>>(this);
        expectAssignable<IEventEmitter<IBaseEvents>>(this);
        expectAssignable<IEventEmitter<T>>(this);

        this.on("base", (b) => {
            expectAssignable<boolean>(b);
        });
        expectError(this.on("base", (b, c) => {
            // too many arguments
        }));
        expectError(this.on("extended", (n) => {
            // not a valid event
        }));
        this.once("error", (error) => {
            expectAssignable<any>(error);
        });
        expectError(this.off("error", (error, extra) => {
            // too many arguments
        }));
        this.emit("base", true);
        expectError(this.emit("base", 1));
        expectError(this.emit("extended", 1));
        this.emit("error", Error("x"));
    }
}


export function testExtendedTypes(emitter: ExtendableEmitter<IExtendedEvents>) {
    expectAssignable<IEventProvider<IBaseEvents>>(emitter);
    expectAssignable<IEventProvider<IExtendedEvents>>(emitter);
    expectAssignable<IEventEmitter<IBaseEvents>>(emitter);
    expectAssignable<IEventEmitter<IExtendedEvents>>(emitter);

    emitter.on("base", (b) => {
        expectType<boolean>(b);
    });
    expectError(emitter.on("base", (b, c) => {
        // too many arguments
    }));
    emitter.on("extended", (n) => {
        expectType<number>(n);
    });
    emitter.once("error", (error) => {
        expectType<any>(error);
    });
    expectError(emitter.off("error", (error, extra) => {
        // too many arguments
    }));
    emitter.emit("base", true);
    expectError(emitter.emit("base", 1));
    emitter.emit("extended", 1);
    emitter.emit("error", Error("x"));
}

export function testExtendableTypes<T extends IBaseEvents>(emitter: ExtendableEmitter<T>) {
    expectAssignable<IEventProvider<IBaseEvents>>(emitter);
    expectAssignable<IEventProvider<T>>(emitter);
    expectAssignable<IEventEmitter<IBaseEvents>>(emitter);
    expectAssignable<IEventEmitter<T>>(emitter);

    emitter.on("base", (b) => {
        expectAssignable<boolean>(b);
    });
    expectError(emitter.on("base", (b, c) => {
        // too many arguments
    }));
    expectError(emitter.on("extended", (n) => {
        // not a valid event
    }));
    emitter.once("error", (error) => {
        expectAssignable<any>(error);
    });
    expectError(emitter.off("error", (error, extra) => {
        // too many arguments
    }));
    emitter.emit("base", true);
    expectError(emitter.emit("base", 1));
    expectError(emitter.emit("extended", 1));
    emitter.emit("error", Error("x"));
}
