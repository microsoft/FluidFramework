package prague.io;

import kafka.consumer.ConsumerIterator;
import kafka.consumer.KafkaStream;

public class ConsumerTest implements Runnable {
    private KafkaStream m_stream;
    private int m_threadNumber;

    public ConsumerTest(KafkaStream a_stream, int a_threadNumber) {
        m_threadNumber = a_threadNumber;
        m_stream = a_stream;
    }

    public void run() {
        ConsumerIterator<byte[], byte[]> it = m_stream.iterator();
        long start = System.currentTimeMillis();
        long messageCount = 0;

        while (it.hasNext()) {
            messageCount++;
            long now = System.currentTimeMillis();
            if (now - start > 5000) {
                double rate = 1000 * messageCount / (now - start);
                System.out.println("Inbound rate " + rate + " messages/second");
                start = now;
                messageCount = 0;
            }
            it.next();
            // System.out.println("Thread " + m_threadNumber + ": " + new String(it.next().message()));
        }
        System.out.println("Shutting down Thread: " + m_threadNumber);
    }
}
