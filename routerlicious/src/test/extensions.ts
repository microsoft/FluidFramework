import * as assert from "assert";
import * as api from "../api";

describe("Routerlicious", () => {
    describe("Extensions", () => {
        let registry: api.Registry;

        beforeEach(() => {
            registry = new api.Registry();
        });

        it("Can create an extension registry", () => {
            assert.ok(registry);
        });

        it("Empty extensions by default", () => {
            assert.ok(registry.extensions);
            assert.equal(registry.extensions.length, 0);
        });

        it("Can register and lookup an extension", () => {
            const extension = new api.MapExtension();
            registry.register(extension);
            assert.equal(registry.extensions.length, 1);
            assert.equal(registry.getExtension(api.MapExtension.Type), extension);
        });
    });
});
