/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect, test } from "@oclif/test";

const test_tags = [
    "client_v2.0.0-internal.1.0.0",
    "client_v1.2.4",
    "client_v1.2.3",
    "build-tools_v0.5.2002",
    "build-tools_v0.4.2001",
    "build-tools_v0.4.2000",
    "build-tools_v0.4.1000",
    "build-tools_v0.3.2000",
];

describe("generate:buildVersion", () => {
    test.stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "0.4.0",
            "--tag",
            "build-tools",
            "--release",
            "none",
            "--tags",
            ...test_tags,
        ])
        .it("outputs prerelease build number", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.4.0-12345");
        });

    test.env({
        VERSION_BUILDNUMBER: "88802",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--fileVersion",
            "0.4.0",
            "--tag",
            "build-tools",
            "--release",
            "none",
            "--tags",
            ...test_tags,
        ])
        .it("reads build number from env variable", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.4.0-88802");
        });

    test.stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "0.4.0",
            "--tag",
            "build-tools",
            "--release",
            "none",
            "--patch",
            "true",
            "--tags",
            ...test_tags,
        ])
        .it("calculates patch version number correctly", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.4.12345");
        });

    test.env({
        VERSION_PATCH: "true",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "0.4.0",
            "--tag",
            "build-tools",
            "--release",
            "none",
            "--tags",
            ...test_tags,
        ])
        .it("reads patch setting from env variable", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.4.12345");
        });

    test.stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "0.5.2002",
            "--tag",
            "build-tools",
            "--release",
            "release",
            "--tags",
            ...test_tags,
        ])
        .it("outputs isLatest=true when release is release", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.5.2002");
            expect(ctx.stdout).to.contain("isLatest=true");
        });

    test.env({
        VERSION_RELEASE: "release",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "0.5.2002",
            "--tag",
            "build-tools",
            "--tags",
            ...test_tags,
        ])
        .it("reads release setting from env variable", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.5.2002");
            expect(ctx.stdout).to.contain("isLatest=true");
        });

    test.env({
        VERSION_TAGNAME: "build-tools",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "0.5.2002",
            "--release",
            "release",
            "--tags",
            ...test_tags,
        ])
        .it("reads tag name from env variable", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.5.2002");
            expect(ctx.stdout).to.contain("isLatest=true");
        });

    test.stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "1.2.4",
            "--tag",
            "client",
            "--release",
            "release",
            "--includeInternalVersions",
            "true",
            "--tags",
            ...test_tags,
        ])
        .it("calculates internal versions as latest", (ctx) => {
            expect(ctx.stdout).to.contain("version=1.2.4");
            expect(ctx.stdout).to.contain("isLatest=false");
        });

    test.env({
        VERSION_INCLUDE_INTERNAL_VERSIONS: "True",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "1.2.4",
            "--tag",
            "client",
            "--release",
            "release",
            "--tags",
            ...test_tags,
        ])
        .it("reads internal versions setting from env variable", (ctx) => {
            expect(ctx.stdout).to.contain("version=1.2.4");
            expect(ctx.stdout).to.contain("isLatest=false");
        });

    test.stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "1.2.4",
            "--tag",
            "client",
            "--release",
            "none",
            "--testBuild",
            "true",
            "--tags",
            ...test_tags,
        ])
        .it("calculates test build numbers correctly", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.0.0-12345-test");
            expect(ctx.stdout).to.contain("isLatest=false");
        });

    test.env({
        TEST_BUILD: "true",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--build",
            "12345",
            "--fileVersion",
            "1.2.4",
            "--tag",
            "client",
            "--release",
            "none",
            "--tags",
            ...test_tags,
        ])
        .it("reads test build setting from env variable", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.0.0-12345-test");
            expect(ctx.stdout).to.contain("isLatest=false");
        });

    test.env({
        VERSION_BUILDNUMBER: "88879",
        VERSION_TAGNAME: "tinylicious",
        TEST_BUILD: "false",
        VERSION_RELEASE: "release",
        VERSION_PATCH: "true",
        VERSION_INCLUDE_INTERNAL_VERSIONS: "False",
    })
        .stdout()
        .command([
            "generate:buildVersion",
            "--fileVersion",
            "0.4.0",
            "--tag",
            "tinylicious",
            "--tags",
            "tinylicious_v0.2.0",
            "tinylicious_v0.2.3810",
            "tinylicious_v0.3.10860",
            "tinylicious_v0.4.0",
            "tinylicious_v0.4.11798",
            "tinylicious_v0.4.13835",
            "tinylicious_v0.4.17169",
            "tinylicious_v0.4.18879",
            "tinylicious_v0.4.21640",
            "tinylicious_v0.4.34614",
            "tinylicious_v0.4.38350",
            "tinylicious_v0.4.45136",
            "tinylicious_v0.4.57763",
            "tinylicious_v0.4.86381",
        ])
        .it("tinylicious test case from 2022-08-26", (ctx) => {
            expect(ctx.stdout).to.contain("version=0.4.88879");
            expect(ctx.stdout).to.contain("isLatest=true");
        });
});
