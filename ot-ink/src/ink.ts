// This is a really simple OT type.
//
// Its included for demonstration purposes and its used in the meta unit tests.
//
// This defines a really simple text OT type which only allows inserts. (No deletes).
//
// Ops look like:
//   {position:#, text:"asdf"}
//
// Document snapshots look like:
//   {str:string}

export const name = "simple";
export const uri = "http://sharejs.org/types/simple";

// Create a new document snapshot. Initial data can be passed in.
export function create(initial) {
    if (initial === null) {
        initial = "";
    }

    return {str: initial};
}

// Apply the given op to the document snapshot. Returns the new snapshot.
export function apply(snapshot, op) {
    if (op.position < 0 || op.position > snapshot.str.length) {
        throw new Error("Invalid position");
    }

    let str = snapshot.str;
    str = str.slice(0, op.position) + op.text + str.slice(op.position);
    return { str };
}

// Transform op1 by op2. Returns transformed version of op1.
// Sym describes the symmetry of the operation. Its either 'left' or 'right'
// depending on whether the op being transformed comes from the client or the
// server.
export function transform(op1, op2, sym) {
    let pos = op1.position;

    if (op2.position < pos || (op2.position === pos && sym === "left")) {
        pos += op2.text.length;
    }

    return {position: pos, text: op1.text};
}
