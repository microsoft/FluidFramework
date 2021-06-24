/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventArgs, EventLiteral, EventLiterals, EventThis, IErrorEvents, IEventProvider } from '@fluidframework/runtime-definitions';
import { expectAssignable, expectError, expectType } from 'tsd';
import { IEventEmitter, TypedEventEmitter } from "../../..";

interface ITestEvents {
    alert: [message: string, counts?: number[]];
    ping: [];
    bad: void;
    alsoBad: number;
    this(n: number, that: EventThis): void;
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
        expectError(this.off("bad", (args) => {
            // not an array
        }));
        expectError(this.prependListener("alsoBad", (args) => {
            // not an array
        }));
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
        expectError(this.emit("bad"));
        expectError(this.emit("alsoBad"));

        // Verify listener events
        this.on("newListener", (event, listener) => {
            expectType<"error" | keyof ITestEvents>(event);
            expectAssignable<CallableFunction>(listener);
        });
        expectError(this.on("newListener", (event, listener, extra) => {
            // too many args
        }));
        this.on("removeListener", (event, listener) => {
            expectType<"error" | keyof ITestEvents>(event);
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

        this.emit("this", 2, this);
        this.on("this", (n, that) => {
            expectType<number>(n);
            expectType<this>(that);
        });
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
    expectError(emitter.off("bad", (args) => {
        expectType<never>(args);
    }));
    expectError(emitter.prependListener("alsoBad", (args) => {
        expectType<never>(args);
    }));
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
    expectError(emitter.emit("bad"));
    expectError(emitter.emit("alsoBad"));
    expectError(emitter.emit("reallyBad"));

    // Verify listener events
    emitter.on("newListener", (event, listener) => {
        expectType<"error" | keyof ITestEvents>(event);
        expectAssignable<CallableFunction>(listener);
    });
    expectError(emitter.on("newListener", (event, listener, extra) => {
        // too many args
    }));
    emitter.on("removeListener", (event, listener) => {
        expectType<"error" | keyof ITestEvents>(event);
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

    emitter.emit("this", 2, emitter);
    emitter.on("this", (n, that) => {
        expectType<number>(n);
        expectType<typeof emitter>(that);
    });
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
    expectError(emitter.off("bad", (args) => {
        expectType<never>(args);
    }));
    expectError(emitter.prependListener("alsoBad", (args) => {
        expectType<never>(args);
    }));
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

    emitter.on("this", (n, that) => {
        expectType<number>(n);
        expectType<typeof emitter>(that);
    });
}

interface IBaseEvents extends IErrorEvents {
    base: [b: boolean];
    testThis(me: EventThis): void;
}

interface IExtendedEvents extends IBaseEvents {
    extended: [n: number];
    many: EventLiterals<[x: number, a: string[], b?: boolean]>;
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

        // Preferred method: by expecting this to be what it knows it is
        this.emit<"testThis", IBaseEvents["testThis"]>("testThis", this);
        // By casting args to what it should be, but casts other params as well
        this.emit("testThis", ...[this] as EventArgs<T["testThis"], this>);
        this.on("testThis", (me) => {
            expectAssignable<ExtendableEmitter<T>>(me);
            expectAssignable<this>(me);
        });
        this.emit("error", "a" as unknown);
        expectError(this.emit("error", 1, 2));
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

    emitter.emit("testThis", emitter);
    emitter.on("testThis", (me) => {
        expectType<ExtendableEmitter<IExtendedEvents>>(me);
        expectType<typeof emitter>(me);
    });
    emitter.emit("error", "s" as unknown);
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

    // Preferred method: by expecting this to be what it knows it is
    emitter.emit<"testThis", IBaseEvents["testThis"]>("testThis", emitter);
    // By casting args to what it should be, but casts other params as well
    emitter.emit("testThis", ...[emitter] as EventArgs<T["testThis"], typeof emitter>);
    emitter.on("testThis", (me) => {
        expectAssignable<ExtendableEmitter<T>>(me);
        expectAssignable<typeof emitter>(me);
    });
}

class FurtherExtendedEmitter extends ExtendableEmitter<IExtendedEvents> {}
export function furtherTest(f: FurtherExtendedEmitter) {
    f.on("testThis", (me) => {
        expectType<FurtherExtendedEmitter>(me);
    });
    f.emit("testThis", f)
    f.emit("error", "a" as unknown);
    expectError(f.emit("error", 1, 2)); // too many args
    f.on("error", (error) => {
        expectType<any>(error);
    })
    expectError(f.on("error", (e1, e2) => {
        // too many args
    }));
    f.on("newListener", (event, listener) => {
        expectType<"error" | "extended" | "base" | "testThis" | "many">(event);
        listener("x" as unknown);
        listener(1, ["x", "y", "z"], false);
    });
}

type Complex<T = any, TReplaced = void> = T extends undefined | null | boolean | number | string | TReplaced ? T : number;
interface IComplexEvents<T> {
    maybe: [
        complex: EventLiteral<Complex<T>>,
        thisOne: EventThis,
        n: number,
    ];
    maybeNot(
        complex: EventLiteral<Complex<T>>,
        thisOne: EventThis,
        n: number,
    ): void;
}
export function checkComplex<T>(emitter: IEventEmitter<IComplexEvents<T>>, complex: Complex<T>) {
    emitter.emit("maybe", complex, emitter, 1);
    emitter.emit("maybeNot", complex, emitter, 2);
    emitter.on("maybe", (complex, thisOne, n) => {
        expectType<Complex<T>>(complex);
        expectType<IEventEmitter<IComplexEvents<T>>>(thisOne);
        expectType<number>(n);
    });
    emitter.on("maybeNot", (complex, thisOne, n) => {
        expectType<Complex<T>>(complex);
        expectType<IEventEmitter<IComplexEvents<T>>>(thisOne);
        expectType<number>(n);
    });
}

interface IEvents1<T> {
    test: EventLiterals<[a: string, b: number, C?: { x: string }]>;
    does: [me: EventThis, you: EventLiteral<T>];
    error: [dog: { name: string }, count: number];
}

const emitter1 = new TypedEventEmitter<IEvents1<boolean>>();
emitter1.emit("test", "x", 1);
emitter1.emit("test", "1", 333, { x: "aaa" });
emitter1.emit("does", emitter1, true);

export function try1<T>(em: IEventEmitter<IEvents1<T>>, it: T) {
    em.emit("test", "x", 1);
    em.emit("test", "1", 333, { x: "aaa" });
    em.emit("does", em, it);
    em.listenerCount("does");
    em.listeners("does").map((l) => l(em, it));
    em.on("newListener", (e, l) => {
        l("x", 1);
    });
    em.on("newListener", (e, l) => {
        l(em, it);
        if (e === "test") {
            l(em, it);
        } else if (e === "does") {
            l(em, it);
        }
    });
    em.on("removeListener", (e, l) => {
        l(em, it);
        if (e === "test") {
            l(em, it);
        } else if (e === "does") {
            l(em, it);
        } else if (e === "error") {
            expectError(l("")); // ideally this would not error
        }
    });
    em.on("error", (dog, count) => {
        expectType<{ name: string }>(dog);
        expectType<number>(count);
    });
    em.on("error", (e: any) => {
        return 1;
    });
}

interface IEvents2<T> {
    test: EventLiterals<[a: string, b: number, C?: { x: string }]>;
    does: [me: EventThis, you: EventLiteral<T>];
}

export function try2<T>(
    it: T,
    em: IEventEmitter<IEvents2<T>> = new TypedEventEmitter<IEvents2<T>>(),
) {
    em.emit("test", "x", 1);
    em.emit("test", "1", 333, { x: "aaa" });
    em.emit("does", em, it);
    em.listenerCount("does");
    em.listeners("does").map((l) => l(em, it));
    em.on("newListener", (e, l) => {
        l("x", 1);
    });
    em.on("newListener", (e, l) => {
        l(em, it);
        if (e === "test") {
            l(em, it);
        } else if (e === "does") {
            l(em, it);
        }
    });
    em.on("removeListener", (e, l) => {
        l(em, it);
        if (e === "test") {
            l(em, it);
        } else if (e === "does") {
            l(em, it);
        } else if (e === "error") {
            l("" as unknown);
        }
    });
    em.on("error", (e) => {
        expectType<any>(e);
    });
    expectError(em.emit("error", 234));
    em.on("error", (a) => false);
    em.on("removeListener", (e, l) => {
        if (e === "error") {
            l("x" as unknown);
        }
    });
}
