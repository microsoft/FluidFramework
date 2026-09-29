---
"__section": fix
---
Pipeline bounded Rust Sea author submissions without waiting for each durable receipt

WebTransport and WebSocket author streams can feed the existing sequencer queue while earlier writes wait for storage.
Policy decorators release FIFO admission ownership after the source submission's first poll, while retaining cancellation and failure handling until completion.
Encryption admission retains FIFO waiter order so concurrent submissions cannot overtake through composed sessions.
Session clients reserve their submission turn before a cooperative scheduler yield can let a later caller overtake.
Request admission and responses remain ordered, and successful acknowledgements still require storage completion.
Membership changes, close, and clean receive EOF drain earlier submissions.

Each author stream defaults to at most 256 pending requests and 4 MiB of encoded input charges, with one additional bounded lookahead request.
These limits exclude downstream and network buffers and are not total-memory limits.
Set `SEA_AUTHOR_WINDOW=1` to restore serial dispatch.
