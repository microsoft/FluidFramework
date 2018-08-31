import { core as api, map } from "@prague/client-api";
import * as assert from "assert";

describe("Routerlicious", () => {
    describe("Api", () => {
        describe("Extensions", () => {
            let registry: api.Registry<api.ICollaborativeObjectExtension>;

            beforeEach(() => {
                registry = new api.Registry<api.ICollaborativeObjectExtension>();
            });

            it("Can create an extension registry", () => {
                assert.ok(registry);
            });

            it("Empty extensions by default", () => {
                assert.ok(registry.extensions);
                assert.equal(registry.extensions.length, 0);
            });

            it("Can register and lookup an extension", () => {
                const extension = new map.MapExtension();
                registry.register(extension);
                assert.equal(registry.extensions.length, 1);
                assert.equal(registry.getExtension(map.MapExtension.Type), extension);
            });
        });
    });
});
