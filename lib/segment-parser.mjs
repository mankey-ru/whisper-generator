import { parseTimestamp, formatTime } from './timestamp-utils.mjs';

/**
 * Преобразует JSON whisper.cpp в чистый массив сегментов
 */
export function parseWhisperSegments(json) {
	const rawSegments = json.transcription || json.segments || json.result?.transcription || [];

	return rawSegments
		.map((seg, idx) => {
			const startMs = seg.offsets?.from ?? (parseTimestamp(seg.timestamps?.from) * 1000);
			const endMs   = seg.offsets?.to   ?? (parseTimestamp(seg.timestamps?.to)   * 1000);

			const start = startMs / 1000;
			const end   = endMs   / 1000;

			return {
				id: `seg-${idx}`,
				start,
				end,
				text: (seg.text || '').trim(),
				timeStr: formatTime(start)
			};
		})
		.filter(s => s.text.length > 0);
}
