/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import path from "path";
import http from "http";
import { instanceOfObject, bindInstanceOfBuiltin } from "../../instanceOf";

const instanceOfJsFilePath = path.join(__dirname, "../../../dist/instanceOf.js");

const PORT = 8081;

describe("instanceOf", () => {
    describe("Object", () => {
        test("matches various types of window.Object", () => {
            expect(instanceOfObject({})).toEqual(true);
            expect(instanceOfObject(new Object())).toEqual(true);
            expect(instanceOfObject(Object("string"))).toEqual(true);
            expect(instanceOfObject(Object.create({}))).toEqual(true);
            expect(instanceOfObject([])).toEqual(true);

            expect(instanceOfObject(null)).toEqual(false);
            expect(instanceOfObject(undefined)).toEqual(false);
            expect(instanceOfObject(() => {})).toEqual(false);
            expect(instanceOfObject(false)).toEqual(false);
            expect(instanceOfObject("abc")).toEqual(false);
            expect(instanceOfObject(123)).toEqual(false);
        });
    });

    describe("Bind-Builtin", () => {
        test("throws for '[object Object]' instances", () => {
            const unthrown = new Set();
            let label = "";

            try {
                unthrown.add(label = "new Object()");
                bindInstanceOfBuiltin(new Object());
            } catch (err) {
                unthrown.delete(label);
            }

            try {
                unthrown.add(label = "new class NonBuiltin {}()");
                // eslint-disable-next-line @typescript-eslint/no-extraneous-class
                bindInstanceOfBuiltin(new class NonBuiltin {}());
            } catch (err) {
                unthrown.delete(label);
            }

            try {
                unthrown.add(label = "Date.prototype");
                bindInstanceOfBuiltin(Date.prototype);
            } catch (err) {
                unthrown.delete(label);
            }

            expect({ unthrownLabels: [] }).toMatchObject({ unthrownLabels: [...unthrown] });
        });

        test("yields instance checking functions", () => {
            const instanceOfMap = bindInstanceOfBuiltin(Map.prototype);
            const instanceOfError = bindInstanceOfBuiltin(new Error("..."));

            expect(instanceOfMap(new Map())).toEqual(true);
            expect(instanceOfMap({})).toEqual(false);

            expect(instanceOfError(new Error("!?"))).toEqual(true);
            expect(instanceOfError([])).toEqual(false);
        });
    });

    describe("IFrame Compatibility", () => {
        let server: http.Server;

        beforeAll(() => {
            const scriptSrc = new Promise((resolve, reject) => {
                fs.readFile(instanceOfJsFilePath, { encoding: "utf8" }, (err, source) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(source);
                    }
                });
            });

            server = http.createServer((req, res) => {
                scriptSrc
                    .then((js) => {
                        const html = `
                        <!DOCTYPE html>
                        <html>
                            <body>
                                <script>
                                    (function iife (exports) {
                                        ${js} // tolerate trailing comments
                                    })(window);
                                </script>
                                <script>
                                    document.body.appendChild(document.createElement("iframe"));
                                    window.ctx = window.frames[window.frames.length - 1];
                                </script>
                            </body>
                        </html>
                        `;

                        res.statusCode = 200;
                        res.setHeader("Content-Type", "text/html");
                        res.end(html);
                    })
                    .catch(() => {
                        res.statusCode = 404;
                        res.setHeader("Content-Type", "text/plain");
                        res.end("not found");
                    });
            });
            server.listen(PORT, "localhost");
        });

        beforeEach(async () => {
            await page.goto(`http://localhost:${PORT}`, { waitUntil: "load", timeout: 0 });
        });

        afterAll(() => {
            server?.close();
        });

        test("checks properly across IFrame boundaries", async () => {
            const allClaims = await page.evaluate(async () => {
                Function.prototype.call = () => "foo bar";
                Object.prototype.toString = () => "resilient to prototype manipulation";

                const { ctx, instanceOfObject: isObject, bindInstanceOfBuiltin: bindIs } = window as any;

                const isSet = bindIs(Set.prototype);

                return {
                    "A1: new Object() instanceof Object": new Object() instanceof Object,
                    "A2: !(new ctx.Object() instanceof Object)": !(new ctx.Object() instanceof Object),
                    "A3: isObject(new Object())": isObject(new Object()),
                    "A4: isObject(new ctx.Object())": isObject(new ctx.Object()),

                    "B1: new Set() instanceof Set": new Set() instanceof Set,
                    "B2: !(new ctx.Set() instanceof Set)": !(new ctx.Set() instanceof Set),
                    "B3: isSet(new Set())": isSet(new Set()),
                    "B4: isSet(new ctx.Set())": isSet(new ctx.Set()),
                };
            });

            // Array<string> (one for each falsey claim -- should be empty)
            const falsyClaims = Object.entries(allClaims).filter(([_, ok]) => !ok).map(([label]) => label);

            expect({ falsyClaims: [] }).toMatchObject({ falsyClaims });
        });
    });
});
