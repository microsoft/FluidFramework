/* eslint-disable no-bitwise */
/* eslint-disable max-len */
import { IPv6, IPv4 } from "ipaddr.js";

/**
 * The network information from the client IP address
 *
 * @internal
 */
export class NetworkInformation {
	public isPrivateLink!: boolean;
	public privateLinkId?: string;
	public privateIpAddress?: string;
}

/*
    The source IPv6 source address carries vnet and private link information as below:

    | byte 1     | byte 2                               | bytes 3-6                | bytes 7-10         | bytes 11-12  | bytes 13-16         |
    |            |       |            |        |        |                          | VNetTrafficTag =   |              |                     |
    | ULA prefix |1: V1  |0:ST        |Reserved|ST      | SNAT VIP OR Pvt Link ID  | Region Id + VNet Id|Subnet Id     |IPv4 Customer address|
    | 8 bits     |0: V2  |1:Pvt Link  |5 bit   |Policy  |  4 bytes = 32 bits       | 4 bytes = 32 bits  |16 bits       |4 bytes = 32 bits    |
    |NSM reserved|9th bit|10th bit    |        |16th bit| Used for encoding Pvt Lnk| Region Id : 8 bit  |              |Used for billing     |
    |            |       |            |        |        | ID OR SNAT VIP of service| Vnet Id : 24 bit   |              |                     |
*/
const PrivateLinkIpStructure = {
	packetVersionBit: 9,
	isPrivateLinkBit: 10,
	privateLinkIdMostSignificantByte: 6,
	privateAddressMostSignificantByte: 13,
};

/**
 * Get the network information from the client IP address, including whether it is a private link and the private link ID.
 *
 * @internal
 */
export function getNetworkInformationFromIP(clientIp?: string): NetworkInformation {
	if (clientIp && IPv6.isValid(clientIp)) {
		const ipBytes = IPv6.parse(clientIp).toByteArray();
		const ipBits = ipBytes.map((ip) => to8BitBinaryString(ip)).join("");
		const result = new NetworkInformation();

		const isV1Packet = ipBits[PrivateLinkIpStructure.packetVersionBit - 1] === "1";
		if (isV1Packet) {
			// V1 packet is never private link
			result.isPrivateLink = false;
		} else {
			const isPrivateLink = ipBits[PrivateLinkIpStructure.isPrivateLinkBit - 1] === "1";
			if (isPrivateLink) {
				// Private link id is little-endian.
				let offset = PrivateLinkIpStructure.privateLinkIdMostSignificantByte;
				let privateLinkId = ipBytes[--offset];
				privateLinkId <<= 8;
				privateLinkId |= ipBytes[--offset];
				privateLinkId <<= 8;
				privateLinkId |= ipBytes[--offset];
				privateLinkId <<= 8;
				privateLinkId |= ipBytes[--offset];

				result.isPrivateLink = true;
				result.privateLinkId = privateLinkId.toString();
			} else {
				result.isPrivateLink = false;
			}
		}

		// The embedded IPv4 address is big-endian.
		const embeddedIpV4: number[] = [];
		for (
			let i = PrivateLinkIpStructure.privateAddressMostSignificantByte - 1;
			embeddedIpV4.length < 4;
			i++
		) {
			embeddedIpV4.push(ipBytes[i]);
		}

		result.privateIpAddress = new IPv4(embeddedIpV4).toString();
		return result;
	} else {
		return {
			isPrivateLink: false,
		};
	}
}

function to8BitBinaryString(byte: number): string {
	let bits = byte.toString(2);
	while (bits.length < 8) {
		bits = "0".concat(bits);
	}

	return bits;
}
