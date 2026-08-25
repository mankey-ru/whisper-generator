/**
 * Shared types for whisper-generator (JSDoc + // @ts-check).
 * Not a compilable TypeScript project — referenced via import('./types.js').
 */

/** Token from whisper.cpp JSON (--output-json / --output-json-full) */
export interface WhisperToken {
	text: string;
	/** Confidence probability 0..1 (present with --output-json-full) */
	p?: number;
}

/** Millisecond offsets block in whisper.cpp JSON */
export interface WhisperOffsets {
	from: number;
	to: number;
}

/** String timestamps block, e.g. "00:01:23.456" */
export interface WhisperTimestamps {
	from: string;
	to: string;
}

/** Raw segment as produced by whisper.cpp */
export interface WhisperRawSegment {
	text?: string;
	offsets?: WhisperOffsets;
	timestamps?: WhisperTimestamps;
	tokens?: WhisperToken[];
}

/**
 * Top-level whisper.cpp JSON shape.
 * Different builds / flags use transcription, segments, or result.transcription.
 */
export interface WhisperJson {
	transcription?: WhisperRawSegment[];
	segments?: WhisperRawSegment[];
	result?: {
		transcription?: WhisperRawSegment[];
	};
}

/** Clean token used in HTML colouring */
export interface TranscriptToken {
	text: string;
	/** Confidence probability 0..1 */
	p: number;
}

/** Normalized segment after parseWhisperSegments() */
export interface TranscriptSegment {
	id: string;
	/** Start time in seconds */
	start: number;
	/** End time in seconds */
	end: number;
	text: string;
	/** HH:MM:SS for display */
	timeStr: string;
	/** Present when --output-json-full had usable tokens */
	tokens?: TranscriptToken[];
}

/** Single CLI option descriptor (feeds node:util parseArgs) */
export interface CliOptionDefinition {
	type: 'boolean' | 'string';
	short?: string;
	default?: boolean | string;
	desc: string;
}

/** Parsed runtime options used by start.mjs / batch pipeline */
export interface CliOptions {
	recurse: boolean;
	force: boolean;
	whisper: string;
	model: string;
	input: string;
	lang: string;
	usevad: boolean;
	keep: boolean;
	/** Colour tokens by confidence in HTML */
	colors: boolean;
	threads: number;
}

/** Options for generateTranscriptHTML() */
export interface HtmlGenerateOptions {
	/**
	 * When not false, colour tokens by confidence if tokens are present.
	 * Default: on (undefined / true).
	 */
	colors?: boolean;
}

/** Detected media kind for the HTML player */
export interface MediaInfo {
	isVideo: boolean;
	mime: string;
	tag: 'audio' | 'video';
}

/** Args for buildPlayerMarkup() */
export interface PlayerMarkupParams {
	tag: 'audio' | 'video';
	playerAttrs: string;
	originalFileName: string;
	mime: string;
	mediaLabel: string;
}

/** Shared args for audio/video body builders */
export interface BodyMarkupParams {
	playerMarkup: string;
	originalFileName: string;
}
