/**
 * CRC32 Implementation for AWS EventStream
 * Uses the same polynomial as AWS SDK
 */

// CRC32 lookup table
const crc32Table = [];

// Initialize table
(function initCrc32Table() {
    const polynomial = 0xEDB88320;
    for (let i = 0; i < 256; i++) {
        let crc = i;
        for (let j = 0; j < 8; j++) {
            if (crc & 1) {
                crc = (crc >>> 1) ^ polynomial;
            } else {
                crc = crc >>> 1;
            }
        }
        crc32Table[i] = crc >>> 0;
    }
})();

/**
 * Calculate CRC32 checksum for a buffer
 * @param {Buffer} data - Buffer to calculate checksum for
 * @returns {number} CRC32 checksum
 */
export function crc32(data) {
    let crc = 0xFFFFFFFF;

    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crc32Table[(crc ^ data[i]) & 0xFF];
    }

    return (crc ^ 0xFFFFFFFF) >>> 0;
}
