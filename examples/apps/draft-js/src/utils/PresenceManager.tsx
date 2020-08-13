/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";

import { SharedMap } from "@fluidframework/map";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";
import { CharacterMetadata, CompositeDecorator, ContentBlock } from "draft-js";
import { List } from "immutable";

import { getColorForMember } from "../view";
import { BlockTextRange, TextRange, textRangeToBlockTextRangeFromBlocks } from "./RichTextAdapter";

// eslint-disable-next-line import/no-unassigned-import
import "./Presence.css";

interface Author {
    id: string;
    color: string;
    pos: TextRange | undefined;
}

interface AuthorWithBlockRange extends Author {
    blockRange: BlockTextRange;
}

const maxPos = { start: Number.MAX_SAFE_INTEGER, end: Number.MAX_SAFE_INTEGER };
const entityPrefix = "presence-";
const placeholderChar = "\u200B"; // Zero width space

export class PresenceManager {
    private readonly coauthorPositions: Map<string, Author> = new Map<string, Author>();

    public constructor(private readonly authorMap: SharedMap, private readonly runtime: IFluidDataStoreRuntime) { }

    public subscribe(renderCallback: (textRangeUpdater: (range: TextRange) => TextRange) => void) {
        this.authorMap.on("op", (op: ISequencedDocumentMessage, local: boolean) => {
            if (local || op.contents.key === this.runtime.clientId) {
                return;
            }

            let oldValue = this.coauthorPositions.get(op.contents.key);
            if (oldValue === undefined) {
                oldValue = {
                    id: "",
                    color: "",
                    pos: undefined,
                };
            }
            const newValue = { ...oldValue, pos: undefined };

            if (op.contents.type === "delete") {
                this.coauthorPositions.delete(op.contents.key);
            } else {
                newValue.id = op.contents.key;
                newValue.pos = op.contents.value.value;
                if (!newValue.color) {
                    const sequencedClient = this.runtime.getQuorum().getMember(op.clientId);
                    newValue.color = getColorForMember(sequencedClient);
                }
                this.coauthorPositions.set(op.contents.key, newValue);
            }

            const newPos = newValue.pos || maxPos;
            const oldPos = oldValue.pos || maxPos;
            const textRangeUpdater = (range: TextRange) => {
                if (oldPos.start < range.start && newPos.start >= range.start) {
                    range.start--;
                } else if (oldPos.start >= range.start && newPos.start < range.start) {
                    range.start++;
                }
                if (oldPos.start < range.end && newPos.start >= range.end) {
                    range.end--;
                } else if (oldPos.start >= range.end && newPos.start < range.end) {
                    range.end++;
                }
                return range;
            };

            renderCallback(textRangeUpdater);
        });

        window.onbeforeunload = () => {
            this.authorMap.delete(this.runtime.clientId);
        };
    }

    public publish(currentPosition: TextRange | undefined) {
        this.authorMap.set(this.runtime.clientId, currentPosition);
    }

    public addPresencePlaceholders(blocks: ContentBlock[]): ContentBlock[] {
        const coauthByBlock = new Map<string, AuthorWithBlockRange[]>();
        this.coauthorPositions.forEach((author, k) => {
            if (author.pos !== undefined) {
                const blockRange = textRangeToBlockTextRangeFromBlocks(author.pos, blocks);
                if (!coauthByBlock.has(blockRange.startKey)) {
                    coauthByBlock.set(blockRange.startKey, [{ ...author, blockRange }]);
                } else {
                    coauthByBlock.get(blockRange.startKey).push({ ...author, blockRange });
                }
            }
        });

        return blocks.map((block) => {
            if (!coauthByBlock.has(block.getKey())) {
                return block;
            }

            let text = block.getText();
            const characterList = block.getCharacterList().toArray();

            const offsetsReverse = coauthByBlock
                .get(block.getKey())
                .sort((a, b) => b.blockRange.startOffset - a.blockRange.startOffset);
            for (const abr of offsetsReverse) {
                const index = abr.blockRange.startOffset;
                text = `${text.slice(0, index)}${placeholderChar}${text.slice(index)}`;
                characterList.splice(index, 0, CharacterMetadata.create({ entity: `${entityPrefix}${abr.id}` }));
            }

            return new ContentBlock({
                key: block.getKey(),
                type: block.getType(),
                text,
                characterList: List.of<CharacterMetadata>(...characterList),
            });
        });
    }

    public removePlaceholderChars(text: string) {
        return text.replace(new RegExp(placeholderChar, "g"), "");
    }

    public subtractCoauthorPlaceholders(range: TextRange): TextRange {
        this.coauthorPositions.forEach((author) => {
            if (author.pos && author.pos.start < range.start) {
                range.start--;
            }
            if (author.pos && author.pos.start < range.end) {
                range.end--;
            }
        });
        return range;
    }

    public getAuthorColor(authorId: string): string {
        const author = this.coauthorPositions.get(authorId);
        return author ? author.color : "";
    }
}

const findPresencePlaceholderStrategy = (block: ContentBlock, callback: (start: number, end: number) => void): void => {
    block.getCharacterList().forEach((char, index) => {
        if (char.getEntity() && char.getEntity().startsWith(entityPrefix)) {
            callback(index, index + 1);
        }
    });
};

export const getCoauthPresenceDecorator = (presenceManager: PresenceManager) => {
    const CoauthorIndicator = (props) => {
        let authorId;
        if (props.entityKey.startsWith(entityPrefix)) {
            authorId = props.entityKey.substring(entityPrefix.length);
        }
        // Replace the placeholder char with some UI If this block is empty (except for the placeholder char) add a
        // <br /> after because that's what Draft does to preserve spacing in empty blocks, and we're turning this into
        // an empty block by removing the placeholder.
        return <>
            <span style={{ backgroundColor: presenceManager.getAuthorColor(authorId) }} className="presence-cursor" />
            {props.start === 0 && props.contentState.getBlockForKey(props.blockKey).getLength() === 1 ? <br /> : null}
        </>;
    };

    return new CompositeDecorator([
        {
            strategy: findPresencePlaceholderStrategy,
            component: CoauthorIndicator,
        },
    ]);
};
