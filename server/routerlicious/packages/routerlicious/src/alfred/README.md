# Alfred

![Michael Caine as Alfred Pennyworth in The Dark Knight Trilogy](https://upload.wikimedia.org/wikipedia/en/1/18/Alfred_Pennyworth_%28Michael_Caine%29.jpg)

Alfred is the entry point to Routerlicious. Clients connect to Alfred via Socket.IO to join the operation stream.
Joining the stream allows them to receive push notifications for new operations, retrieve old operations, as well as
create new ones. We make use of Redis for push notifications. New operations are placed inside of Apache Kafka for
processing.
