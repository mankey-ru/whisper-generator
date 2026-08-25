// @ts-check

import { parseArgs } from 'node:util';

// Defaults (override with env or CLI named options)

export const DEFAULT_WHISPER_DIR = `P:\\!Whisper.cpp`;

/** @type {Readonly<Record<string, import('../types.js').CliOptionDefinition>>} */
export const CLI_OPTIONS = {
	help: {
		type: 'boolean',
		short: 'h',
		desc: 'Показать эту справку и выйти',
	},
	recurse: {
		type: 'boolean',
		short: 'r',
		default: false,
		desc: 'Обрабатывать вложенные папки рекурсивно',
	},
	force: {
		type: 'boolean',
		short: 'f',
		default: false,
		desc: 'Принудительно перезаписывать файлы',
	},
	whisper: {
		type: 'string',
		desc: 'Путь к исполняемому файлу whisper (whisper-cli или main)',
		default: process.env.WHISPER_EXE || `${DEFAULT_WHISPER_DIR}\\whisper-cli.exe`,
	},
	model: {
		type: 'string',
		desc: 'Путь к модели whisper (ggml-*.bin)',
		default: process.env.WHISPER_MODEL || `${DEFAULT_WHISPER_DIR}\\models\\ggml-large-v3.bin`,
	},
	input: {
		type: 'string',
		desc: 'Путь к входной папке/файлу',
		default: 'input',
	},
	lang: {
		type: 'string',
		short: 'l',
		desc: 'Язык распознавания (ru, en, auto и т.д.)',
		default: process.env.LANGUAGE || 'ru',
	},
	usevad: {
		type: 'boolean',
		//short: 'v',
		desc: 'Использовать VAD (Voice Activity Detection)',
		default: false,
	},
	keep: {
		type: 'boolean',
		short: 'k',
		desc: 'Сохранить промежуточные файлы',
		default: false,
	},
	colors: {
		type: 'boolean',
		default: false,
		desc: 'Цвета уверенности токенов (whisper --print-colors + --output-json-full → цветной HTML)',
	},
	threads: {
		type: 'string', // будем парсить в int
		desc: 'Количество потоков (по умолчанию из DEFAULTS)',
		default: process.env.THREADS || '12',
	},
};

/**
 * Парсит именованные аргументы с помощью util.parseArgs
 * @param {string[]} [argv]
 * @returns {import('../types.js').CliOptions}
 */
export function parseNamedOptions(argv = process.argv.slice(2)) {
	const options = CLI_OPTIONS;

	const { values } = parseArgs({
		args: argv,
		options,
		allowPositionals: true,
		allowNegative: true, // --no-colors и т.п.
		strict: true, // кидает ошибку на неизвестные флаги
	});

	/** @type {import('../types.js').CliOptions} */
	const opts = {
		recurse: Boolean(values.recurse),
		force: Boolean(values.force),
		whisper: String(values.whisper ?? ''),
		model: String(values.model ?? ''),
		input: String(values.input ?? 'input'),
		lang: String(values.lang ?? 'ru'),
		usevad: Boolean(values.usevad),
		keep: Boolean(values.keep),
		colors: Boolean(values.colors),
		threads: parseInt(String(values.threads ?? '12'), 10),
	};

	if (values.help) {
		printHelp();
		process.exit(0);
	}

	return opts;
}

export function printHelp() {
	console.log(`
whisper-generator — batch transcription + clickable HTML

Usage:
  npm start -- [options]
  npm start -- --help
  npm start -- --input ./tmp --usevad --keep 				(для отладки удобно)
  npm start --input ./audio --lang ru --threads 8 -r
`);
	for (const [long, opt] of Object.entries(CLI_OPTIONS)) {
		const short = opt.short ? ` (-${opt.short}) ` : '    ';
		const typeInfo = opt.type === 'boolean' ? '' : ` <${opt.type}>`;
		console.log(`  --${long}${short}${typeInfo}`);
		if (opt.desc) {
			console.log(`      ${opt.desc}`);
		}
	}
}
