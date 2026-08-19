import { parseTimestamp, formatTime } from './timestamp-utils.mjs';

/** Special whisper tokens like [_BEG_], [_TT_550] */
function isSpecialTokenText(text) {
	return /^\s*\[_.*\]\s*$/.test(text || '');
}

/**
 * Преобразует JSON whisper.cpp в чистый массив сегментов.
 * При --output-json-full сохраняет tokens[].p для цветного HTML.
 */
export function parseWhisperSegments(json) {
	const rawSegments = json.transcription || json.segments || json.result?.transcription || [];

	return rawSegments
		.map((seg, idx) => {
			const startMs = seg.offsets?.from ?? parseTimestamp(seg.timestamps?.from) * 1000;
			const endMs = seg.offsets?.to ?? parseTimestamp(seg.timestamps?.to) * 1000;

			const start = startMs / 1000;
			const end = endMs / 1000;
			const text = (seg.text || '').trim();

			const tokens = Array.isArray(seg.tokens)
				? seg.tokens
						.filter((t) => t && typeof t.text === 'string' && !isSpecialTokenText(t.text))
						.map((t) => ({
							text: t.text,
							p: typeof t.p === 'number' ? t.p : 1,
						}))
				: undefined;

			return {
				id: `seg-${idx}`,
				start,
				end,
				text,
				timeStr: formatTime(start),
				...(tokens && tokens.length ? { tokens } : {}),
			};
		})
		.filter((s) => s.text.length > 0);
}
