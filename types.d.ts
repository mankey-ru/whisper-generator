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
	/** Override default coerce (boolean→Boolean, string→String), e.g. threads → number */
	cast?: (value: boolean | string) => unknown;
}

/** Parsed runtime options used by start.js / batch pipeline */
export interface CliOptions {
	recurse: boolean;
	force: boolean;
	whisper: string;
	/** Absent when config.js has no isVAD model — VAD is then off */
	vadModel?: string;
	/** Key of a model in config.js */
	modelKey: string;
	/** Model path resolved from modelKey */
	model: string;
	input: string;
	lang: string;
	/** Skip packing into an _OUT folder, keep intermediate files next to the source */
	debug: boolean;
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


export interface FfmpegAudioConfig {
	inputFile: string;
	outputFile: string;
	sampleRate?: number;
	channels?: number;
	codec?: string;
	overwrite?: boolean;
}

/** Fields shared by every model entry in config.js */
interface ModelBase {
	/** Unique id, used by --modelKey and QUANTIZE keyFrom */
	key: string;
	/** File name inside <whisperDir>/models */
	name: string;
	/** Model picked when --modelKey is not given */
	isDefault?: boolean;
	/** Silero VAD model; excluded from the --modelKey list */
	isVAD?: boolean;
	/** npm run get leaves this model alone */
	skip?: boolean;
}

/** Model downloaded as-is */
export interface UrlModel extends ModelBase {
	sourceType: 'URL';
	sourceParams: {
		url: string;
	};
}

/** Model produced by whisper.cpp quantize from another model */
export interface QuantizeModel extends ModelBase {
	sourceType: 'QUANTIZE';
	sourceParams: {
		/** Key of the source model */
		keyFrom: string;
		/** Extra quantize args, e.g. ['q8_0'] */
		cliOpts: string[];
	};
}

export type ModelConfig = UrlModel | QuantizeModel;

/** Default export of config.js */
export interface AppConfig {
	/** whisper.cpp root: models/ and build/bin/ live here */
	whisperDir: string;
	models: ModelConfig[];
}
