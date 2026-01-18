/**
 * AWS Smithy EventStream Binary Encoder
 * Encodes messages in the AWS EventStream binary format
 * 
 * Format:
 * - 4 bytes: total message length (big-endian)
 * - 4 bytes: headers length (big-endian)
 * - 4 bytes: prelude CRC32
 * - N bytes: headers
 * - M bytes: payload
 * - 4 bytes: message CRC32
 */

import { crc32 } from './crc32.js';

/**
 * Encode a string header value
 * @param {string} name - Header name
 * @param {string} value - Header value
 * @returns {Buffer} Encoded header
 */
function encodeStringHeader(name, value) {
    const nameBuffer = Buffer.from(name, 'utf8');
    const valueBuffer = Buffer.from(value, 'utf8');

    const header = Buffer.alloc(1 + nameBuffer.length + 1 + 2 + valueBuffer.length);
    let offset = 0;

    // Name length
    header.writeUInt8(nameBuffer.length, offset);
    offset += 1;

    // Name
    nameBuffer.copy(header, offset);
    offset += nameBuffer.length;

    // Type (7 = string)
    header.writeUInt8(7, offset);
    offset += 1;

    // Value length (big-endian)
    header.writeUInt16BE(valueBuffer.length, offset);
    offset += 2;

    // Value
    valueBuffer.copy(header, offset);

    return header;
}

/**
 * Encode a complete EventStream message
 * @param {string} eventType - Event type name
 * @param {Object} payload - JSON payload
 * @returns {Buffer} Encoded message
 */
export function encodeEventStreamMessage(eventType, payload) {
    // Encode headers
    const headers = [
        encodeStringHeader(':event-type', eventType),
        encodeStringHeader(':content-type', 'application/json'),
        encodeStringHeader(':message-type', 'event')
    ];

    const headersBuffer = Buffer.concat(headers);
    const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');

    // Calculate lengths
    const preludeLength = 12;
    const headersLength = headersBuffer.length;
    const payloadLength = payloadBuffer.length;
    const messageCrcLength = 4;
    const totalLength = preludeLength + headersLength + payloadLength + messageCrcLength;

    // Create message buffer
    const message = Buffer.alloc(totalLength);
    let offset = 0;

    // Write total message length
    message.writeUInt32BE(totalLength, offset);
    offset += 4;

    // Write headers length
    message.writeUInt32BE(headersLength, offset);
    offset += 4;

    // Calculate and write prelude CRC
    const preludeCrc = crc32(message.subarray(0, 8));
    message.writeUInt32BE(preludeCrc, offset);
    offset += 4;

    // Write headers
    headersBuffer.copy(message, offset);
    offset += headersLength;

    // Write payload
    payloadBuffer.copy(message, offset);
    offset += payloadLength;

    // Calculate and write message CRC
    const messageCrc = crc32(message.subarray(0, offset));
    message.writeUInt32BE(messageCrc, offset);

    return message;
}

/**
 * Create an assistantResponseEvent message
 */
export function createAssistantResponseEvent(content) {
    return encodeEventStreamMessage('assistantResponseEvent', { content });
}

/**
 * Create a meteringEvent message
 */
export function createMeteringEvent(usage) {
    return encodeEventStreamMessage('meteringEvent', {
        unit: 'credit',
        unitPlural: 'credits',
        usage
    });
}

/**
 * Create a contextUsageEvent message
 */
export function createContextUsageEvent(percentage) {
    return encodeEventStreamMessage('contextUsageEvent', {
        contextUsagePercentage: percentage
    });
}

/**
 * Create a toolUseEvent message
 * @param {Object} payload - Tool use payload (name, input, toolUseId, stop)
 */
export function createToolUseEvent(payload) {
    return encodeEventStreamMessage('toolUseEvent', payload);
}
