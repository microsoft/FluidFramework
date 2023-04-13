import { Schema, Typed } from "./schema";

export const schema = new Schema();

const part = schema.object("Contoso:Part", {
	name: schema.string,
	quantity: schema.number
});

const inventory = schema.object("Contoso:Inventory", {
	parts: schema.array(part)
});

export type Inventory = Typed<typeof inventory>;

// Simple usage example:
const myInventory: Inventory = inventory({
	parts: [part({ name: "hello", quantity: 0 })],
});

myInventory.parts.slice();
