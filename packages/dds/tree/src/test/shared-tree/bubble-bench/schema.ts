import { brand } from "../../../util";
import { emptyField, FieldKinds } from "../../../feature-libraries";
import { fieldSchema, namedTreeSchema, SchemaData, ValueSchema } from "../../../schema-stored";
import { EmptyKey, JsonableTree, rootFieldKey } from "../../../tree";

export const stringSchema = namedTreeSchema({
    name: brand("String"),
    extraLocalFields: emptyField,
    value: ValueSchema.String,
});

export const int32Schema = namedTreeSchema({
    name: brand("Int32"),
    extraLocalFields: emptyField,
    value: ValueSchema.Number,
});

export const iBubbleSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiBubble-1.0.0"),
    localFields: {
        x: fieldSchema(FieldKinds.value, [int32Schema.name]),
        y: fieldSchema(FieldKinds.value, [int32Schema.name]),
        r: fieldSchema(FieldKinds.value, [int32Schema.name]),
        vx: fieldSchema(FieldKinds.value, [int32Schema.name]),
        vy: fieldSchema(FieldKinds.value, [int32Schema.name]),
    },
    extraLocalFields: emptyField,
});

export const iBubbleSequenceSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiBubbleSequence-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [iBubbleSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const simpeBubblesSequenceSchema = namedTreeSchema({
    name: brand("Test:SimpleBubbles-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [iBubbleSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const iClientSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiClient-1.0.0"),
    localFields: {
        clientId: fieldSchema(FieldKinds.value, [stringSchema.name]),
        color: fieldSchema(FieldKinds.value, [stringSchema.name]),
        bubbles: fieldSchema(FieldKinds.sequence, [iBubbleSequenceSchema.name]),
        simpleBubbles: fieldSchema(FieldKinds.optional, [simpeBubblesSequenceSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const iClientSequenceSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppStateiClientSequence-1.0.0"),
    localFields: {
        [EmptyKey]: fieldSchema(FieldKinds.sequence, [iClientSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const bubbleBenchAppStateSchema = namedTreeSchema({
    name: brand("Test:BubbleBenchAppState-1.0.0"),
    localFields: {
        localClient: fieldSchema(FieldKinds.value, [iClientSchema.name]),
        clients: fieldSchema(FieldKinds.sequence, [iClientSequenceSchema.name]),
        width: fieldSchema(FieldKinds.value, [int32Schema.name]),
        height: fieldSchema(FieldKinds.value, [int32Schema.name]),
    },
    extraLocalFields: emptyField,
});


export const rootBubbleBenchAppStateSchema = fieldSchema(FieldKinds.value, [bubbleBenchAppStateSchema.name]);

export const bubbleBenchAppStateSchemaData: SchemaData = {
    treeSchema: new Map([
        [stringSchema.name, stringSchema],
        [int32Schema.name, int32Schema],
        [iBubbleSchema.name, iBubbleSchema],
        [iBubbleSequenceSchema.name, iBubbleSequenceSchema],
        [simpeBubblesSequenceSchema.name, simpeBubblesSequenceSchema],
        [iClientSchema.name, iClientSchema],
        [iClientSequenceSchema.name, iClientSequenceSchema],
        [bubbleBenchAppStateSchema.name, bubbleBenchAppStateSchema],
    ]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootBubbleBenchAppStateSchema],
    ]),
};

export const bubbleBenchAppStateJsonTree: JsonableTree = {
    type: bubbleBenchAppStateSchema.name,
    fields: {
        localClient: [{
            type: iClientSchema.name,
            fields: {
                clientId: [{ type: stringSchema.name, value: "1" }],
                color: [{ type: stringSchema.name, value: "red" }],
                bubbles: [
                    {
                        type: iBubbleSchema.name,
                        fields: {
                            x: [{ type: int32Schema.name, value: 10 }],
                            y: [{ type: int32Schema.name, value: 11 }],
                            r: [{ type: int32Schema.name, value: 12 }],
                            vx: [{ type: int32Schema.name, value: 13 }],
                            vy: [{ type: int32Schema.name, value: 14 }],
                        }
                    },
                    {
                        type: iBubbleSchema.name,
                        fields: {
                            x: [{ type: int32Schema.name, value: 20 }],
                            y: [{ type: int32Schema.name, value: 20 }],
                            r: [{ type: int32Schema.name, value: 20 }],
                            vx: [{ type: int32Schema.name, value: 20 }],
                            vy: [{ type: int32Schema.name, value: 20 }],
                        }
                    }
                ],
                simpleBubbles: [{
                    type: simpeBubblesSequenceSchema.name,
                    fields: {
                        [EmptyKey]: [
                            {
                                type: iBubbleSchema.name,
                                fields: {
                                    x: [{ type: int32Schema.name, value: 10 }],
                                    y: [{ type: int32Schema.name, value: 10 }],
                                    r: [{ type: int32Schema.name, value: 10 }],
                                    vx: [{ type: int32Schema.name, value: 10 }],
                                    vy: [{ type: int32Schema.name, value: 10 }],
                                }
                            },
                            {
                                type: iBubbleSchema.name,
                                fields: {
                                    x: [{ type: int32Schema.name, value: 20 }],
                                    y: [{ type: int32Schema.name, value: 20 }],
                                    r: [{ type: int32Schema.name, value: 20 }],
                                    vx: [{ type: int32Schema.name, value: 20 }],
                                    vy: [{ type: int32Schema.name, value: 20 }],
                                }
                            }
                        ]
                    }
                }]
            }
        }],
        width: [{ type: int32Schema.name, value: 1920 }],
        height: [{ type: int32Schema.name, value: 1080 }],
        clients: [{
            type: iClientSequenceSchema.name,
            fields: {
                [EmptyKey]: [
                    {
                        type: iClientSchema.name,
                        fields: {
                            clientId: [{ type: stringSchema.name, value: "2" }],
                            color: [{ type: stringSchema.name, value: "blue" }],
                            bubbles: [
                                {
                                    type: iBubbleSchema.name,
                                    fields: {
                                        x: [{ type: int32Schema.name, value: 10 }],
                                        y: [{ type: int32Schema.name, value: 10 }],
                                        r: [{ type: int32Schema.name, value: 10 }],
                                        vx: [{ type: int32Schema.name, value: 10 }],
                                        vy: [{ type: int32Schema.name, value: 10 }],
                                    }
                                },
                                {
                                    type: iBubbleSchema.name,
                                    fields: {
                                        x: [{ type: int32Schema.name, value: 20 }],
                                        y: [{ type: int32Schema.name, value: 20 }],
                                        r: [{ type: int32Schema.name, value: 20 }],
                                        vx: [{ type: int32Schema.name, value: 20 }],
                                        vy: [{ type: int32Schema.name, value: 20 }],
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        }]
    }
}
