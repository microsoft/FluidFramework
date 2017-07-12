import * as nconf from "nconf";
import * as rimrafCallback from "rimraf";
import * as request from "supertest";
import * as util from "util";
import * as app from "../app";

const rimraf = util.promisify(rimrafCallback);

const provider = new nconf.Provider({}).defaults({
    logger: {
        colorize: true,
        json: false,
        level: "info",
        morganFormat: "dev",
        timestamp: true,
    },
    storageDir: "/tmp/historian",
});

describe("Historian", () => {
    describe("repos", () => {
        let supertest: request.SuperTest<request.Test>;

        beforeEach(() => {
            const testApp = app.create(provider);
            supertest = request(testApp);
        });

        afterEach(() => {
            return rimraf(provider.get("storageDir"));
        });

        it("Can create a new repo", () => {
            return supertest
                .post("/repos")
                .set("Accept", "application/json")
                .set("Content-Type", "application/json")
                .send({ name: "new-repo"})
                .expect(201);
        });
    });
});
