// @ts-check

// Утилиты конвертации времени (whisper offsets + SRT)

/**
 * @param {string | number | null | undefined} ts
 * @returns {number} seconds
 */
export function parseTimestamp(ts) {
	if (!ts) return 0;
	const str = String(ts).replace(',', '.');
	const parts = str.split(':').map((p) => parseFloat(p));
	if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
	if (parts.length === 2) return parts[0] * 60 + parts[1];
	return parts[0] || 0;
}

/**
 * @param {number} sec
 * @returns {string} HH:MM:SS
 */
export function formatTime(sec) {
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	return [h, m, s].map((v) => v.toString().padStart(2, '0')).join(':');
}

/**
 * @param {number} seconds
 * @returns {string} SRT timestamp HH:MM:SS,mmm
 */
export function toSRTTime(seconds) {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.floor((seconds % 1) * 1000);
	return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
