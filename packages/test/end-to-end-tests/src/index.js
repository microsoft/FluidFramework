"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.mochaGlobalSetup = void 0;

class DummyLogger {
    send(baseEvent) {
        console.log("#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#@#");
        console.log(baseEvent);
    }
}

const _global = global;
_global.getTestLogger = () => {
    const logger = new DummyLogger();
    return logger;
};
// can be async or not
const mochaGlobalSetup = function () {
    var _a;
    if (((_a = _global.getTestLogger) === null || _a === void 0 ? void 0 : _a.call(_global)) === undefined) {
        throw new Error("aria-logger Mocha Hooks not initialized properly");
    }
};
exports.mochaGlobalSetup = mochaGlobalSetup;
//# sourceMappingURL=mochaHooks.js.map