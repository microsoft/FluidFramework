/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import express from "express";
import * as sinon from "sinon";
import request from "supertest";
import * as nconf from "nconf";
import { TestThrottler } from "@fluidframework/server-test-utils";
import * as historianApp from "../app";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { TestTenantService } from "../test-utils/testTenantService";
import { TestCache } from "../test-utils/testCache";
import { RestGitService } from "../services";

// const document1 = {
//     _id: "doc-1",
//     content: "Hello, World!",
// }
const appTenant: IAlfredTenant = {
    id: "testTenant",
    key: "tenant-key-1",
};
const limit = 10;
const sha = "testSha";
const url = "http://test-historian.com";
const defaultCache = new TestCache();
const defaultProvider = new nconf.Provider({}).defaults({
    auth: {
        maxTokenLifetimeSec: 1000000,
        enableTokenExpiration: true
    },
    logger: {
        morganFormat: "dev",
    }
});
const defaultTenantService = new TestTenantService();

describe("throttling", () => {
    describe("verify blobs endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getBlobStub: any;
        let createBlobStub: any;

        beforeEach(() => {
            getBlobStub = sinon.stub(RestGitService.prototype, "getBlob").returns(Promise.resolve({
                content: "testContent",
                encoding: "testEncoding",
                url: url,
                sha: sha,
                size: 1
            }));
            createBlobStub = sinon.stub(RestGitService.prototype, "createBlob").returns(Promise.resolve({
                url: url,
                sha: sha
            }));

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getBlobStub.restore();
            createBlobStub.restore();
        });

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/git/blobs", () => {
            it("/ping", async () => {
                await assertThrottle("/repos/ping");
            });
            it("/:ignored?/:tenantId/git/blobs", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/blobs`, "post");
            });
            it("/:ignored?/:tenantId/git/blobs/:sha", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/blobs/${sha}`);
            });
            it("/:ignored?/:tenantId/git/blobs/raw/:sha", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/blobs/raw/${sha}`);
            });
        });
    });

    describe("verify commits endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getCommitStub: any;
        let getCommitsStub: any;
        let createCommitStub: any;

        beforeEach(() => {
            getCommitStub = sinon.stub(RestGitService.prototype, "getCommit").returns(Promise.resolve({
                sha: sha,
                url: url,
                author: { name: "test", email: "test@domain.com", date: "time" },
                committer: { name: "test", email: "test@domain.com", date: "time" },
                message: "testMessage",
                tree: { url: url, sha: sha },
                parents: [{ url: url, sha: sha }]
            }));
            getCommitsStub = sinon.stub(RestGitService.prototype, "getCommits").returns(Promise.resolve([{
                url: url,
                sha: sha,
                commit: {
                    url: url,
                    author: { name: "test", email: "test@domain.com", date: "time" },
                    committer: { name: "test", email: "test@domain.com", date: "time" },
                    message: "testMessage",
                    tree: { url: url, sha: sha },
                },
                parents: []
            }]));
            createCommitStub = sinon.stub(RestGitService.prototype, "createCommit").returns(Promise.resolve({
                sha: sha,
                url: url,
                author: { name: "test", email: "test@domain.com", date: "time" },
                committer: { name: "test", email: "test@domain.com", date: "time" },
                message: "testMessage",
                tree: { url: url, sha: sha },
                parents: [{ url: url, sha: sha }]
            }));

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getCommitStub.restore();
            getCommitsStub.restore();
            createCommitStub.restore();
        });

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/git/commits", () => {
            it("/:ignored?/:tenantId/git/commits", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/commits`, "post");
            });
            it("/:ignored?/:tenantId/git/commits/:sha", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/commits/${sha}`);
            });
        });

        describe("/repo/commits", () => {
            it("/:ignored?/:tenantId/commits", async () => {
                await assertThrottle(`/repos/${appTenant.id}/commits`);
            });
        });
    });

    describe("verify refs endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getRefStub: any;
        let getRefsStub: any;
        let createRefStub: any;
        let updateRefStub: any;
        let deleteRefStub: any;

        beforeEach(() => {
            getRefStub = sinon.stub(RestGitService.prototype, "getRef").returns(Promise.resolve({
                ref: "testRef",
                url: url,
                object: {
                    type: "testType",
                    sha: sha,
                    url: url
                }
            }));
            getRefsStub = sinon.stub(RestGitService.prototype, "getRefs").returns(Promise.resolve([{
                ref: "testRef",
                url: url,
                object: {
                    type: "testType",
                    sha: sha,
                    url: url
                }
            }]));
            createRefStub = sinon.stub(RestGitService.prototype, "createRef").returns(Promise.resolve({
                ref: "testRef",
                url: url,
                object: {
                    type: "testType",
                    sha: sha,
                    url: url
                }
            }));
            updateRefStub = sinon.stub(RestGitService.prototype, "updateRef").returns(Promise.resolve({
                ref: "testRef",
                url: url,
                object: {
                    type: "testType",
                    sha: sha,
                    url: url
                }
            }));
            deleteRefStub = sinon.stub(RestGitService.prototype, "deleteRef").returns(Promise.resolve());

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getRefStub.restore();
            getRefsStub.restore();
            createRefStub.restore();
            updateRefStub.restore();
            deleteRefStub.restore();
        })

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/git/refs", () => {
            it("/:ignored?/:tenantId/git/refs", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/refs`);
            });
            it("/:ignored?/:tenantId/git/refs/*", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/refs/*`);
            });
            it("/:ignored?/:tenantId/git/refs post", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/refs`, "post");
            });
            it("/:ignored?/:tenantId/git/refs/* patch", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/refs/*`, "patch");
            });
            it("/:ignored?/:tenantId/git/refs/* delete", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/refs/*`, "delete");
            });
        });
    });

    describe("verify tags endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getTagStub: any;
        let createTagStub: any;

        beforeEach(() => {
            getTagStub = sinon.stub(RestGitService.prototype, "getTag").returns(Promise.resolve({
                tag: "testTag",
                sha: sha,
                url: url,
                message: "testMessage",
                tagger: { name: "test", email: "test@domain.com", date: "now" },
                object: {
                    type: "testType",
                    sha: sha,
                    url: url
                }
            }));
            createTagStub = sinon.stub(RestGitService.prototype, "createTag").returns(Promise.resolve({
                tag: "testTag",
                sha: sha,
                url: url,
                message: "testMessage",
                tagger: { name: "test", email: "test@domain.com", date: "now" },
                object: {
                    type: "testType",
                    sha: sha,
                    url: url
                }
            }));

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getTagStub.restore();
            createTagStub.restore();
        });

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/git/tags", () => {
            it("/:ignored?/:tenantId/git/tags", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/tags`, "post");
            });
            it("/:ignored?/:tenantId/git/tags/*", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/tags/*`);
            });
        });
    });

    describe("verify trees endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getTreeStub: any;
        let createTreeStub: any;

        beforeEach(() => {
            getTreeStub = sinon.stub(RestGitService.prototype, "getTree").returns(Promise.resolve({
                sha: sha,
                url: url,
                tree: []
            }));
            createTreeStub = sinon.stub(RestGitService.prototype, "createTree").returns(Promise.resolve({
                sha: sha,
                url: url,
                tree: []
            }));

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getTreeStub.restore();
            createTreeStub.restore();
        });

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/git/trees", () => {
            it("/:ignored?/:tenantId/git/trees", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/trees`, "post");
            });
            it("/:ignored?/:tenantId/git/tags/:sha", async () => {
                await assertThrottle(`/repos/${appTenant.id}/git/trees/${sha}`);
            });
        });
    });

    describe("verify contents endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getContentStub: any;

        beforeEach(() => {
            getContentStub = sinon.stub(RestGitService.prototype, "getContent").returns(Promise.resolve({
                sha: sha,
                url: url,
                tree: []
            }));

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getContentStub.restore();
        });

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/repo/contents", () => {
            it("/:ignored?/:tenantId/contents/*", async () => {
                await assertThrottle(`/repos/${appTenant.id}/contents/*`);
            });
        });
    });

    describe("verify trees endpoints", () => {
        let app: express.Application;
        let supertest: request.SuperTest<request.Test>;
        let getHeaderStub: any;
        let getTreeStub: any;

        beforeEach(() => {
            getHeaderStub = sinon.stub(RestGitService.prototype, "getHeader").returns(Promise.resolve({
                tree: { sha: sha, url: url, tree: [] },
                blobs: []
            }));
            getTreeStub = sinon.stub(RestGitService.prototype, "getFullTree").returns(Promise.resolve({
                sha: sha,
                url: url,
                tree: []
            }));

            const throttler = new TestThrottler(limit);
            app = historianApp.create(
                defaultProvider,
                defaultTenantService,
                defaultCache,
                throttler
            );
            supertest = request(app);
        });

        afterEach(() => {
            getHeaderStub.restore();
            getTreeStub.restore();
        });

        const assertThrottle = async (url: string, method: "get" | "post" | "patch" | "delete" = "get"): Promise<void> => {
            for (let i = 0; i < limit; i++) {
                // we're not interested in making the requests succeed with 200s, so just assert that not 429
                await supertest[method](url).expect((res) => {
                    assert.notStrictEqual(res.status, 429);
                });
            };
            await supertest[method](url).expect(429);
        };

        describe("/repo/headers", () => {
            it("/:ignored?/:tenantId/headers/:sha", async () => {
                await assertThrottle(`/repos/${appTenant.id}/headers/${sha}`);
            });
            it("/:ignored?/:tenantId/tree/:sha", async () => {
                await assertThrottle(`/repos/${appTenant.id}/tree/${sha}`);
            });
        });
    });
});