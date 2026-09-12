use snapshotted_stream_client::CounterClient;
use snapshotted_stream_memory::MemoryStream;

#[tokio::main]
async fn main() {
    let stream = MemoryStream::new();
    let client = CounterClient::new(&stream);

    client.append_delta(2).await.expect("append 2");
    let snapshot_position = client.append_delta(3).await.expect("append 3");
    client
        .publish_snapshot(5, Some(snapshot_position))
        .await
        .expect("publish snapshot");
    client.append_delta(-1).await.expect("append -1");

    let (value, _) = client.recover().await.expect("recover counter");
    assert_eq!(value, 4);
    println!("recovered counter: {value}");
}
