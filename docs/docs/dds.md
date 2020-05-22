---
uid: dds
---

# Distributed Data Structures

Much of Fluid's power lies in a set of base primitives called distributed data structures. These data structures, such
as such as [SharedMap](./SharedMap.md) and the various types in the @microsoft/fluid-sequence package, are eventually
consistent. The Fluid runtime manages these data structures; as changes are made locally and remotely, they are merged
in seamlessly by the runtime.

When you're working with a DDS, you can largely treat it as a local object. You can make changes to it as needed.
However, this local object can be changed not only by your local code, but also by the Fluid runtime. The Fluid runtime
is responsible for inbounding changes from the server and then replaying those changes locally. This means your code
should be structured to react to changes to the DDS instances and update accordingly.

As you make changes to the local DDS instance, the changes are sent to the Fluid server. Other clients are notified of
the change -- or they can query the server for changes -- and then merge the changes in locally. All of this is managed
by the Fluid runtime.

The quality of eventual consistency improves performance because local changes can be made optimistically, knowing that
the runtime will merge the change in the appropriate way eventually. This is a guarantee made by the Fluid runtime.
Thus, you need not check for changes prior to 'committing' local changes. If there are changes on the server, they will
be retrieved and merged in seamlessly, and events will be emitted by the data structures, allowing your code to react to
the changes if needed. And this all happens _very_ quickly.

::: tip
To avoid UI jitter when inbounding a lot of changes, consider just rendering based on frames per second, rather than on
data inbound. At data inbound you can invalidate portions of the UI to re-render when you render next. This decoupling
rendering from data inbound should reduce UI jitter.
:::

There are cases, however, where the eventually consistent guarantee is insufficient. In these cases, the consensus data
structures are useful. These types of data structures defer applying operations until they're acknowledged by the
server. This ensures that each client .pops() a different value from a stack, for example.

<!-- The content for this section will come from this [source document][1].

[1]: https://microsoft.sharepoint.com/:w:/t/Prague/EbN0Q0YfRpxLhvu71KvtpacBWAUoOm88XDRXd_p-6GfmfQ?e=3DckiM

<iframe src="https://microsoft.sharepoint.com/teams/Prague/_layouts/15/Doc.aspx?sourcedoc={464374b3-461f-4b9c-86fb-bbd4abeda5a7}&amp;action=embedview&amp;wdStartOn=1" width="695px" height="1000px" frameborder="0">This is an embedded <a target="_blank" href="https://office.com">Microsoft Office</a> document, powered by <a target="_blank" href="https://office.com/webapps">Office</a>.</iframe> -->
