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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn recovers_from_initial_snapshot() {
        let stream = MemoryStream::new();
        let client = CounterClient::new(&stream);
        client
            .publish_snapshot(10, None)
            .await
            .expect("publish initial snapshot");
        client.append_delta(-3).await.expect("append delta");

        let (value, head) = client.recover().await.expect("recover counter");

        assert_eq!(value, 7);
        assert!(head.is_some());
    }

    #[tokio::test]
    async fn recovers_only_records_after_later_snapshot() {
        let stream = MemoryStream::new();
        let client = CounterClient::new(&stream);
        client.append_delta(2).await.expect("append first delta");
        let snapshot_position = client.append_delta(3).await.expect("append second delta");
        client
            .publish_snapshot(5, Some(snapshot_position))
            .await
            .expect("publish later snapshot");
        let expected_head = client.append_delta(-1).await.expect("append final delta");

        let (value, head) = client.recover().await.expect("recover counter");

        assert_eq!(value, 4);
        assert_eq!(head, Some(expected_head));
    }
}
