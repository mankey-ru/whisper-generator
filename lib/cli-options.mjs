// @ts-check

import path from 'node:path';
import { parseArgs } from 'node:util';

import config from '../config.mjs';

const MODELS_DIR = path.join(config.whisperDir, 'models');
const WHISPER_MODELS = config.models.filter((model) => !model.isVAD);
const DEFAULT_MODEL = WHISPER_MODELS.find((model) => model.isDefault);
const VAD_MODEL = config.models.find((model) => model.isVAD);

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
	modelKey: {
		type: 'string',
		desc: `Ключ модели whisper из config.mjs (${WHISPER_MODELS.map((model) => model.key).join(', ')}), по умолчанию — ${DEFAULT_MODEL ? `${DEFAULT_MODEL.key} (${DEFAULT_MODEL.name})` : 'не задана (нет isDefault)'}`,
		...(DEFAULT_MODEL && { default: DEFAULT_MODEL.key }),
	},
	vadModel: {
		type: 'string',
		desc: `Путь к модели VAD (Voice Activity Detection) (ggml-*.bin), по умолчанию — первая с isVAD в config.mjs${VAD_MODEL ? ` (${VAD_MODEL.key}, ${VAD_MODEL.name})` : ' (не задана, VAD выключен)'}`,
		...(VAD_MODEL && { default: path.join(MODELS_DIR, VAD_MODEL.name) }),
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
	debug: {
		type: 'boolean',
		short: 'd',
		desc: 'Не упаковывать результат в папку _OUT, оставить все файлы (включая промежуточный .wav) рядом с исходником',
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

	opts.model = resolveModelPath(opts.modelKey);

	return opts;
}

/**
 * @param {string | undefined} modelKey
 * @returns {string}
 */
function resolveModelPath(modelKey) {
	if (!modelKey) {
		throw new Error('не указан --modelKey и в config.mjs нет модели с isDefault');
	}
	const model = WHISPER_MODELS.find((m) => m.key === modelKey);
	if (!model) {
		throw new Error(`неизвестный modelKey: ${modelKey}`);
	}
	return path.join(MODELS_DIR, model.name);
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
