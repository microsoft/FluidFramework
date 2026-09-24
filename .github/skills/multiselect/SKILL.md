---
name: multiselect
description: Use when a workflow needs the user to select one, several, or all items from a list but the available question interface supports only one selected choice. Do not use when the user must select exactly one item or when a yes-or-no question is sufficient.
---

# Multiselect

Use the single-select `ask_user` interface as a predictable multiselect interaction.
This skill does not provide real checkboxes.

## Present the question

1. Assign each item a stable, one-based number in its original order.
2. Add each numbered item as a separate choice.
3. Add `ALL` as the final choice.
4. State in the question that the user can select multiple items with the free-form input.
5. Include one short example such as `1,3,5` or `1-3,5`.

Use this structure:

```text
Which items should be processed?

To select multiple items, use the free-form input and enter numbers such as
`1,3,5` or `1-3,5`.
```

```text
choices:
- 1 - Authentication
- 2 - Storage
- 3 - Networking
- 4 - Telemetry
- ALL
```

Do not add a redundant custom-selection choice.
The interface provides the free-form input automatically.

If selecting no items is valid, add `NONE` immediately before `ALL`.
Otherwise, do not offer or accept an empty selection.

## Interpret the answer

Interpret a clicked numbered choice as a selection of that one item.
Interpret `ALL` case-insensitively as every item.
Interpret `NONE` case-insensitively as no items only when `NONE` was offered.

For a free-form answer:

- Trim surrounding whitespace.
- Accept comma-separated positive integers, such as `1,3,5`.
- Accept inclusive ascending ranges, such as `1-3`.
- Accept a mixture of integers and ranges, such as `1,3-5,8`.
- Allow whitespace around commas and hyphens.
- Remove duplicate selections.
- Return selected items in their original list order, not the order entered.

Reject the complete answer if it contains:

- A number outside the offered range.
- Zero or a negative number.
- A descending range.
- An incomplete range.
- Text other than an offered `ALL` or `NONE`.
- `ALL` or `NONE` mixed with another token.
- An empty selection when `NONE` was not offered.

Do not guess what an invalid answer means.
Ask the same question again, briefly identify the invalid input, and repeat the accepted format.

## Continue the workflow

After resolving the answer, state the selected item names briefly before acting.
Do not ask for an additional confirmation unless the action itself requires confirmation.
Pass the resolved item set back to the calling workflow and continue that workflow.
