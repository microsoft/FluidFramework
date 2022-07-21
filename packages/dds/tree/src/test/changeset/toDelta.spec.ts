/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TreeSchemaIdentifier } from "../..";
import {
    Delta,
    ProtoNode,
    toDelta as toDeltaImpl,
    Transposed as T,
} from "../../changeset";
import { FieldKey } from "../../tree";
import { brand } from "../../util";
import { deepFreeze } from "../utils";

function toDelta(changeset: T.Changeset): Delta.Root {
    deepFreeze(changeset);
    const delta: Delta.Root = toDeltaImpl(changeset);
    return delta;
}

const type = brand<TreeSchemaIdentifier>("Node");
const fooKey = "foo" as FieldKey;
const content: ProtoNode[] = [{
    type,
    value: 42,
    fields: { foo: [{ type, value: 43 }] },
}];

const opId = 42;

describe("toDelta", () => {
    it("empty changeset", () => {
        const changeset: T.Changeset = {
            marks: [],
        };
        const expected: Delta.Root = [];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("set root value", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: {
                    type: "Modify",
                    value: { type: "Set", value: 1 },
                },
            }],
        };
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.Root = [{ offset: 0, mark }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("set child value", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [{
                            offset: 42,
                            mark: {
                                type: "Modify",
                                value: { type: "Set", value: 1 },
                            },
                        }],
                    },
                },
            }],
        };
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert root", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: [{
                    type: "Insert",
                    id: opId,
                    content,
                }],
            }],
        };
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const expected: Delta.Root = [{ offset: 0, mark }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("insert child", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [{
                            offset: 42,
                            mark: [{
                                type: "Insert",
                                id: opId,
                                content,
                            }],
                        }],
                    },
                },
            }],
        };
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete root", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: {
                    type: "Delete",
                    id: opId,
                    count: 10,
                },
            }],
        };
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.Root = [{ offset: 0, mark }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("delete child", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [{
                            offset: 42,
                            mark: {
                                type: "Delete",
                                id: opId,
                                count: 10,
                            },
                        }],
                    },
                },
            }],
        };
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [{ offset: 42, mark }]]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    it("the lot on a field", () => {
        const changeset: T.Changeset = {
            marks: [{
                mark: {
                    type: "Modify",
                    fields: {
                        foo: [
                            {
                                mark: {
                                    type: "Delete",
                                    id: opId,
                                    count: 10,
                                },
                            },
                            {
                                offset: 3,
                                mark: [{
                                    type: "Insert",
                                    id: opId,
                                    content,
                                }],
                            },
                            {
                                offset: 1,
                                mark: {
                                    type: "Modify",
                                    value: { type: "Set", value: 1 },
                                },
                            },
                        ],
                    },
                },
            }],
        };
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const set: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: Delta.Root = [{
            offset: 0,
            mark: {
                type: Delta.MarkType.Modify,
                fields: new Map([[
                    fooKey,
                    [
                        { offset: 0, mark: del },
                        { offset: 3, mark: ins },
                        { offset: 1, mark: set },
                    ],
                ]]),
            },
        }];
        const actual = toDelta(changeset);
        assert.deepStrictEqual(actual, expected);
    });

    describe("Modifications to inserted content", () => {
        it("values", () => {
            const changeset: T.Changeset = {
                marks: [{
                    mark: [{
                        type: "MInsert",
                        id: opId,
                        content: content[0],
                        value: { type: "Set", value: 4242 },
                        fields: {
                            foo: [{
                                mark: {
                                    type: "Modify",
                                    value: { type: "Set", value: 4343 },
                                },
                            }],
                        },
                    }],
                }],
            };
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 4242,
                    fields: {
                        foo: [{ type, value: 4343 }],
                    },
                }],
            };
            const expected: Delta.Root = [{ offset: 0, mark }];
            const actual = toDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });

        it("inserts", () => {
            const changeset: T.Changeset = {
                marks: [{
                    mark: [{
                        type: "MInsert",
                        id: opId,
                        content: content[0],
                        fields: {
                            foo: [
                                {
                                    offset: 0,
                                    mark: [{
                                        type: "Insert",
                                        id: opId,
                                        content: [{ type, value: 44 }],
                                    }],
                                },
                                {
                                    offset: 1,
                                    mark: [{
                                        type: "Insert",
                                        id: opId,
                                        content: [{ type, value: 45 }],
                                    }],
                                },
                            ],
                        },
                    }],
                }],
            };
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 42,
                    fields: {
                        foo: [
                            { type, value: 44 },
                            { type, value: 43 },
                            { type, value: 45 },
                        ],
                    },
                }],
            };
            const expected: Delta.Root = [{ offset: 0, mark }];
            const actual = toDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });

        it("modified inserts", () => {
            const changeset: T.Changeset = {
                marks: [{
                    mark: [{
                        type: "MInsert",
                        id: opId,
                        content: content[0],
                        fields: {
                            foo: [
                                {
                                    offset: 1,
                                    mark: [{
                                        type: "MInsert",
                                        id: opId,
                                        content: { type, value: 45 },
                                        value: { type: "Set", value: 4545 },
                                    }],
                                },
                            ],
                        },
                    }],
                }],
            };
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 42,
                    fields: {
                        foo: [{ type, value: 43 }, { type, value: 4545 }],
                    },
                }],
            };
            const expected: Delta.Root = [{ offset: 0, mark }];
            const actual = toDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });

        it("delete", () => {
            const changeset: T.Changeset = {
                marks: [{
                    mark: [{
                        type: "MInsert",
                        id: opId,
                        content: content[0],
                        fields: {
                            foo: [
                                {
                                    mark: {
                                        type: "Delete",
                                        id: opId,
                                        count: 1,
                                    },
                                },
                            ],
                        },
                    }],
                }],
            };
            const mark: Delta.Insert = {
                type: Delta.MarkType.Insert,
                content: [{
                    type,
                    value: 42,
                }],
            };
            const expected: Delta.Root = [{ offset: 0, mark }];
            const actual = toDelta(changeset);
            assert.deepStrictEqual(actual, expected);
        });
    });
});
