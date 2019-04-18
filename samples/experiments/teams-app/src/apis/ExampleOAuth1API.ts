import * as request from "request";
import * as querystring from "querystring";
import * as config from "config";
let http = require("http");

const apiBaseUri = "https://api.Template.com";

// Callback for HTTP requests
export interface RequestCallback {
    (error: any, body?: any): void;
}

// API wrapper
export class ExampleOAuth1API {

    // Creates a new request wrapper for a given API.
    constructor() {
        // do nothing in constructor
    }

    // Make a GET request to API.
    // Syntax: .get(uri, [query], callback)
    public get(uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        this.request("GET", uri, argsOrCallback, callback);
    };

    public getAsync(uri: string, args: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            this.get(uri, args, (err, result) => {
                if (!err) {
                    resolve(result);
                } else {
                    reject(err);
                }
            });
        });
    };

    // Make a DELETE request to API.
    // Syntax: .delete(uri, [query], callback)
    public del(uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        this.request("DELETE", uri, argsOrCallback, callback);
    };

    public delAsync(uri: string, args: any = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            this.del(uri, args, (err, result) => {
                if (!err) {
                    resolve(result);
                } else {
                    reject(err);
                }
            });
        });
    };

    // Make a POST request to API.
    // Syntax: .post(uri, [query], callback)
    public post(uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        this.request("POST", uri, argsOrCallback, callback);
    };

    public postAsync(uri: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.post(uri, args, (err, result) => {
                if (!err) {
                    resolve(result);
                } else {
                    reject(err);
                }
            });
        });
    };

    // Make a PUT request to API.
    // Syntax: .put(uri, [query], callback)
    public put(uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        this.request("PUT", uri, argsOrCallback, callback);
    };

    public putAsync(uri: string, args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.put(uri, args, (err, result) => {
                if (!err) {
                    resolve(result);
                } else {
                    reject(err);
                }
            });
        });
    };

    // Make a request to API.
    // Syntax: .request(method, uri, [query], callback)
    private request(method: string, uri: string, argsOrCallback?: any | RequestCallback, callback?: RequestCallback): void {
        let args: any;

        if (callback) {
            args = argsOrCallback;
        } else {
            callback = argsOrCallback;
            args = {};
        }

        let url = apiBaseUri + (uri[0] === "/" ? "" : "/") + uri;

        if (method === "GET" || method === "DELETE") {
            url += "?" + querystring.stringify(this.parseQuery(uri, args));
        }

        let options: request.Options = {
            url: url,
            method: method,
            oauth: {
                consumer_key: config.get("externalApp.consumer_key"),
                consumer_secret: config.get("externalApp.consumer_secret"),
                token: config.get("externalAppUser.token"),
                token_secret: config.get("externalAppUser.token_secret"),
            },
            json: true,
        };

        let requestCallback = function (err: any, response: any, body: any): void {
            if (!err && response.statusCode >= 400) {
                err = new Error(body);
                err.statusCode = response.statusCode;
                err.responseBody = body;
                err.statusMessage = http.STATUS_CODES[response.statusCode];
            }

            callback(err, body);
        };

        switch (method.toLowerCase())
        {
            case "get":
                request.get(options, requestCallback);
                break;
            case "post":
                request.post(options, requestCallback);
                break;
            case "put":
                request.put(options, requestCallback);
                break;
            case "delete":
                request.delete(options, requestCallback);
                break;
        }
    };

    // Parse the query string parameters in the uri into the arguments
    private parseQuery(uri: string, args: any): any {
        if (uri.indexOf("?") !== -1) {
            let ref = querystring.parse(uri.split("?")[1]);

            for (let key in ref) {
                let value = ref[key];
                args[key] = value;
            }
        }

        return args;
    };
}
