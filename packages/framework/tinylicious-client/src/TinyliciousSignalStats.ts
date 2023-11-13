import { type IDeltaQueue, type IContainer } from "@fluidframework/container-definitions";
import { type ISignalMessage } from "@fluidframework/protocol-definitions";
import { CircularBuffer } from "./utils";
import { type ISignalTransmissionData } from "./interfaces";

/**
 * Signal statistics for Tinylicious service.
 */
export class TinyliciousSignalStats {

	private readonly inboundSignalQueue : IDeltaQueue<ISignalMessage>;
	private readonly signalBuffer : CircularBuffer<SignalStatistics>;

	public constructor(container: IContainer) {

		this.inboundSignalQueue = container.deltaManager.inboundSignal;
		this.signalBuffer = new CircularBuffer<SignalStatistics>(10);

		// Add a new signal statistic item every second
		setInterval(() => this.signalBuffer.add(new SignalStatistics()), 1000);

		// Update current signal statsitics when a new signal has been received
		this.inboundSignalQueue.on("op", (task: ISignalMessage) => {
			const currentStats = this.signalBuffer.getLast();
			if (currentStats) {
				if (task.clientId === container.clientId) {
					currentStats.fromClient.count++;
					currentStats.fromClient.size += JSON.stringify(task.content).length;
					currentStats.fromClient.packetCount++;
					currentStats.fromClient.packetSize += JSON.stringify(task.content).length;
				} 

				currentStats.toClient.count++;
				currentStats.toClient.size += JSON.stringify(task.content).length;
				currentStats.toClient.packetCount++;
				currentStats.toClient.packetSize += JSON.stringify(task.content).length;
			}
		});
			
	}

	/**
	 * Returns the current signal statistics
	 */
	public stats(): SignalStatistics[] {
		const currentStats = this.signalBuffer.getLastN(this.signalBuffer.getBufferLength());
		return currentStats;
	}
			
}



class SignalStatistics {
	/**
	 * Length of time (milliseconds) these statistics cover
	 */
	public timespan: number;

	/**
	 * Statistics for signals sent by client
	 */
	public fromClient: ISignalTransmissionData;

	/**
	 * Statistics for signals sent to client
	 */
	public toClient: ISignalTransmissionData;

	public constructor() {
		this.timespan = 0;
		this.fromClient = {
			count: 0,
			size: 0,
			packetCount: 0,
			packetSize: 0,
		};
		this.toClient = {
			count: 0,
			size: 0,
			packetCount: 0,
			packetSize: 0,
		};

		// Update the timespan ever 100ms
		const timespanInterval = setInterval(() => 
			this.timespan < 1000 ? this.timespan += 100 : clearInterval(timespanInterval), 100);
	}
}
