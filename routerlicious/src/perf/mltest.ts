// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// We should probably move this test to somewhere else. perf folder is not the right place.
import * as request from "request";

const endPoint = nconf.get("intelligence:nativeTextAnalytics:url") + "api/sentiment/query";

console.log("Testing ml service...");
runTest();

async function runTest() {
    await test();
}

async function test() {
    const data: any = {documents: [{
        text: "REST services could be dangerous",
    }]};
    return new Promise<any>((resolve, reject) => {
        request.post(
            endPoint,
            {
                body: data,
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                json: true,
            },
            (error, result, body) => {
                if (error) {
                    console.log(`Error fetching result: ${error}`);
                    return reject(error);
                }

                if (result.statusCode !== 200) {
                    console.log(`Error: Invalid response code: ${JSON.stringify(result)}`);
                    return reject(result);
                }

                console.log(`Success fetching data: ${JSON.stringify(body)}`);
                return resolve(body);
            });
    });
}
