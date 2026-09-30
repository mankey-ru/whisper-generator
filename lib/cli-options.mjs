// @ts-check

import { parseArgs } from 'node:util';

import config from '../config.mjs';

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
		desc: 'Принудительно перезаписывать файлы (кроме .wav)',
	},
	whisper: {
		type: 'string',
		desc: 'Путь к исполняемому файлу whisper (whisper-cli или main)',
		default: `${config.whisperDir}\\whisper-cli.exe`,
	},
	model: {
		type: 'string',
		desc: 'Путь к модели whisper (ggml-*.bin)',
		default: `${config.whisperDir}\\models\\ggml-large-v3.bin`,
	},
	vadModel: {
		type: 'string',
		desc: 'Путь к модели VAD (Voice Activity Detection) (ggml-*.bin)',
		default: `${config.whisperDir}\\models\\ggml-silero-v6.2.0.bin`,
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
		default: 'ru',
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
		type: 'string', // parseArgs string; cast → int
		desc: 'Количество потоков (по умолчанию из DEFAULTS)',
		default: '12',
		cast: (v) => parseInt(String(v), 10),
	},
};

/**
 * @param {import('../types.js').CliOptionDefinition} def
 * @param {unknown} value
 */
function resolveOption(def, value) {
	const raw = /** @type {boolean | string} */ (value ?? def.default);
	if (def.cast) return def.cast(raw);
	return def.type === 'boolean' ? Boolean(raw) : String(raw);
}

/**
 * Парсит именованные аргументы с помощью util.parseArgs
 * @param {string[]} [argv]
 * @returns {import('../types.js').CliOptions}
 */
export function parseNamedOptions(argv = process.argv.slice(2)) {
	const { values } = parseArgs({
		args: argv,
		options: CLI_OPTIONS,
		allowPositionals: true,
		allowNegative: true, // --no-colors и т.п.
		strict: true, // кидает ошибку на неизвестные флаги
	});

	if (values.help) {
		printHelp();
		process.exit(0);
	}

	/** @type {import('../types.js').CliOptions} */
	const opts = /** @type {import('../types.js').CliOptions} */ (
		/** @type {unknown} */ (
			Object.fromEntries(
				Object.entries(CLI_OPTIONS)
					.filter(([, def]) => def.default !== undefined)
					.map(([key, def]) => [key, resolveOption(def, values[key])]),
			)
		)
	);

	return opts;
}

export function printHelp() {
	console.log(`
whisper-generator — batch transcription + clickable HTML

Usage:
  npm start -- [options]
  npm start -- --help
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
