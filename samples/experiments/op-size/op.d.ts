import * as $protobuf from "protobufjs";
/** Namespace op. */
export namespace op {

    /** Properties of a SequencedOp. */
    interface ISequencedOp {

        /** SequencedOp clientId */
        clientId: string;

        /** SequencedOp clientSequenceNumber */
        clientSequenceNumber: (number|Long);

        /** SequencedOp contents */
        contents?: (string|null);

        /** SequencedOp minimumSequenceNumber */
        minimumSequenceNumber: (number|Long);

        /** SequencedOp referenceSequenceNumber */
        referenceSequenceNumber: (number|Long);

        /** SequencedOp sequenceNumber */
        sequenceNumber: (number|Long);

        /** SequencedOp timestamp */
        timestamp: (number|Long);

        /** SequencedOp traces */
        traces?: (string[]|null);

        /** SequencedOp type */
        type: string;
    }

    /** Represents a SequencedOp. */
    class SequencedOp implements ISequencedOp {

        /**
         * Constructs a new SequencedOp.
         * @param [properties] Properties to set
         */
        constructor(properties?: op.ISequencedOp);

        /** SequencedOp clientId. */
        public clientId: string;

        /** SequencedOp clientSequenceNumber. */
        public clientSequenceNumber: (number|Long);

        /** SequencedOp contents. */
        public contents: string;

        /** SequencedOp minimumSequenceNumber. */
        public minimumSequenceNumber: (number|Long);

        /** SequencedOp referenceSequenceNumber. */
        public referenceSequenceNumber: (number|Long);

        /** SequencedOp sequenceNumber. */
        public sequenceNumber: (number|Long);

        /** SequencedOp timestamp. */
        public timestamp: (number|Long);

        /** SequencedOp traces. */
        public traces: string[];

        /** SequencedOp type. */
        public type: string;

        /**
         * Creates a new SequencedOp instance using the specified properties.
         * @param [properties] Properties to set
         * @returns SequencedOp instance
         */
        public static create(properties?: op.ISequencedOp): op.SequencedOp;

        /**
         * Encodes the specified SequencedOp message. Does not implicitly {@link op.SequencedOp.verify|verify} messages.
         * @param message SequencedOp message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(message: op.ISequencedOp, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Encodes the specified SequencedOp message, length delimited. Does not implicitly {@link op.SequencedOp.verify|verify} messages.
         * @param message SequencedOp message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encodeDelimited(message: op.ISequencedOp, writer?: $protobuf.Writer): $protobuf.Writer;

        /**
         * Decodes a SequencedOp message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns SequencedOp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): op.SequencedOp;

        /**
         * Decodes a SequencedOp message from the specified reader or buffer, length delimited.
         * @param reader Reader or buffer to decode from
         * @returns SequencedOp
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): op.SequencedOp;

        /**
         * Verifies a SequencedOp message.
         * @param message Plain object to verify
         * @returns `null` if valid, otherwise the reason why it is not
         */
        public static verify(message: { [k: string]: any }): (string|null);

        /**
         * Creates a SequencedOp message from a plain object. Also converts values to their respective internal types.
         * @param object Plain object
         * @returns SequencedOp
         */
        public static fromObject(object: { [k: string]: any }): op.SequencedOp;

        /**
         * Creates a plain object from a SequencedOp message. Also converts values to other types if specified.
         * @param message SequencedOp
         * @param [options] Conversion options
         * @returns Plain object
         */
        public static toObject(message: op.SequencedOp, options?: $protobuf.IConversionOptions): { [k: string]: any };

        /**
         * Converts this SequencedOp to JSON.
         * @returns JSON object
         */
        public toJSON(): { [k: string]: any };
    }
}
