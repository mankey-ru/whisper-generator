#!/usr/bin/env node
// -@ts-check

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { inspect, parseArgs } from 'node:util';

import { parseWhisperSegments } from './lib/segment-parser.mjs';
import { generateTranscriptHTML } from './lib/html-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_EXTS = ['.mp3', '.m4a', '.ogg', '.flac', '.aac']; // , '.wav'

// Defaults (override with env or CLI named options)

const DEFAULT_WHISPER_DIR = `C:\\whisper.cpp`;

const CLI_OPTIONS = {
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
	keep: {
		type: 'boolean',
		short: 'k',
		desc: 'Сохранить промежуточные файлы',
		default: false,
	},
	threads: {
		type: 'string', // будем парсить в int
		desc: 'Количество потоков (по умолчанию из DEFAULTS)',
		default: process.env.THREADS || '12',
	},
};

async function fileExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function findAudioFiles(dir, recurse) {
	const results = [];
	async function walk(current) {
		let entries;
		try {
			entries = await fs.readdir(current, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const full = path.join(current, entry.name);
			if (entry.isDirectory()) {
				if (recurse) await walk(full);
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase();
				if (AUDIO_EXTS.includes(ext)) {
					results.push(full);
				}
			}
		}
	}
	await walk(dir);
	return results;
}

function runCmd(cmd, args) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: 'inherit' });
		child.on('error', (err) => {
			console.error(`Failed to launch ${cmd}:`, err.message);
			resolve(1);
		});
		child.on('close', (code) => {
			resolve(code ?? 1);
		});
	});
}

async function ensureWav(inputFile, wavFile) {
	if (await fileExists(wavFile)) return true;
	console.log('  Converting to WAV (16kHz mono)...');
	const code = await runCmd('ffmpeg', [
		'-i',
		inputFile,
		'-ar',
		'16000',
		'-ac',
		'1',
		'-c:a',
		'pcm_s16le',
		wavFile,
		'-y',
	]);
	if (code !== 0) {
		console.error('\t❌ ffmpeg conversion failed');
	}
	return code === 0;
}

async function runWhisper(wavFile, opts) {
	console.log('\tRunning whisper.cpp...');
	const args = [
		'-m',
		opts.model,
		'-f',
		wavFile,
		'-l',
		opts.lang,
		'-t',
		String(opts.threads),
		//`--output-file "${path.basename(wavFile, path.extname(wavFile))}"`,
		'--output-json',
		// '--output-txt',
		'--print-progress',
	];
	const code = await runCmd(opts.whisper, args);
	return code === 0;
}

async function generateHtmlForFile(jsonFilePath, htmlFilePath, originalFileName) {
	if (!(await fileExists(jsonFilePath))) {
		console.warn(
			`\t⚠️  JSON file not found: ${path.basename(jsonFilePath)}, skipping HTML generation`,
		);
		return false;
	}
	// console.log(`\tGenerating HTML for: ${path.basename(jsonFilePath)}`);
	try {
		const jsonRaw = await fs.readFile(jsonFilePath, 'utf8');
		const json = JSON.parse(jsonRaw);
		const segments = parseWhisperSegments(json);
		if (segments.length === 0) return false;

		const html = generateTranscriptHTML(segments, originalFileName);
		await fs.writeFile(htmlFilePath, html, 'utf8');
		console.log(`\t✅ Generated HTML: ${path.basename(htmlFilePath)}`);
		return true;
	} catch (err) {
		console.warn(`\t❌ Failed to generate HTML: ${err.message}`);
		return false;
	}
}

async function runBatch(opts) {
	const inputDir = opts.input;

	await fs.mkdir(inputDir, { recursive: true });

	const files = await findAudioFiles(inputDir, opts.recurse);

	if (files.length === 0) {
		console.log(`No audio files found in ${inputDir}`);
		console.log(`Supported extensions: ${AUDIO_EXTS.join(', ')}`);
		console.log('Put files into the input directory and run again.');
		return;
	}

	console.log(
		`Found ${files.length} audio file(s) in ${inputDir}${opts.recurse ? ' (recursive)' : ''}`,
	);
	console.log(`Using whisper: ${opts.whisper}`);
	console.log(`Model: ${opts.model}`);
	printLine('=');

	for (const originalFilePath of files) {
		const dir = path.dirname(originalFilePath);
		const ext = path.extname(originalFilePath);
		/** Базовое имя inputFile (не wav) без расширения */
		const originalFileBaseName = path.basename(originalFilePath, ext);
		const originalFileName = path.basename(originalFilePath);

		const wavFileName = `${originalFileBaseName}.wav`;
		const wavFilePath = path.join(dir, wavFileName);

		//const txtFileName = `${originalFileBaseName}.txt`;
		//const txtFilePath = path.join(dir, txtFileName);

		const jsonFileName = `${originalFileBaseName}.json`;
		const jsonFilePath = path.join(dir, jsonFileName);

		const htmlFilePath = path.join(dir, `${originalFileBaseName}.html`);

		console.log(
			`\nProcessing: ${inspect(
				{
					originalFileName,
					originalFileBaseName,
					wavFilePath,
					wavFileName,
					//txtFileName,
					//txtFilePath,
					jsonFileName,
					jsonFilePath,
					htmlFilePath,
				},
				{ colors: true, compact: false, depth: 2 },
			)}`,
		);

		const txtExists = true; //await fileExists(txtFilePath);
		const jsonExists = await fileExists(jsonFilePath);
		if (!txtExists || !jsonExists || opts.force) {
			// console.log(`..........Processing: ${originalFileName}`);

			const wavFileOk = await ensureWav(originalFilePath, wavFilePath);
			if (wavFileOk) {
				if (await ensureWav(originalFilePath, wavFilePath)) {
					const whisperOk = await runWhisper(wavFilePath, opts);
					if (!whisperOk) {
						console.error(
							`\t❌ Whisper failed for ${wavFilePath} (${originalFileName}), skipping this file`,
						);
						continue;
					}
					// не работает почему-то задание имени JSON-файла через --output-json, поэтому переименовываем вручную
					const jsonOutputFilePath = `${wavFilePath}.json`;
					const jsonOutputFilePathNew = jsonOutputFilePath.replace(/\.wav\.json$/, '.json');
					console.log(`jsonOutputFilePath=`, jsonOutputFilePath);
					console.log(`jsonOutputFilePathNew=`, jsonOutputFilePathNew);
					await fs.rename(jsonOutputFilePath, jsonOutputFilePathNew, (err) => {
						if (err) console.error(`Ошибка для ${jsonOutputFilePath}:`, err);
						else console.log(`Переименован: ${jsonOutputFilePath} → ${jsonOutputFilePathNew}`);
					});
				}
				// else {
				// 	console.log(`\t✓ Wav exists: ${txtFilePath}`);
				// 	continue;
				// }
			} else {
				console.error(`\t❌ Failed to convert ${originalFileName} to WAV, skipping this file`);
				continue;
			}
		} else {
			console.log(`\t✓ Txt and JSON exist`);
		}

		const htmlOk = await generateHtmlForFile(jsonFilePath, htmlFilePath, originalFileName);
		if (!htmlOk) {
			continue;
		}

		if (!opts.keep) {
			fs.unlink(wavFilePath);
			fs.unlink(jsonFilePath);
		}

		console.log(`\t✅ File done: ${originalFileBaseName}`);
		printLine();
	}

	printLine('=');
	console.log('\n Processing complete.');
}

// async function runSingle(audioPath, jsonPath) {
// 	if (!audioPath || !jsonPath) {
// 		console.error('Использование:');
// 		console.error('  node start.mjs <audio.mp3> <audio.json>');
// 		console.error('  или: npm start -- <audio.mp3> <audio.json>');
// 		process.exit(1);
// 	}

// 	const audioName = path.basename(audioPath);
// 	const jsonRaw = await fs.readFile(jsonPath, 'utf8');
// 	const json = JSON.parse(jsonRaw);

// 	const segments = parseWhisperSegments(json);

// 	if (segments.length === 0) {
// 		console.warn('⚠️  Не найдено ни одного сегмента в JSON');
// 	}

// 	const html = generateTranscriptHTML(segments, jsonFilePath);
// 	const outName = path.basename(audioPath, path.extname(audioPath)) + '.html';

// 	await fs.writeFile(outName, html, 'utf8');

// 	console.log(`✅ Создан файл: ${outName}`);
// 	console.log('   Положи его рядом с аудиофайлом и открой в браузере.');
// }

async function main() {
	const opts = parseNamedOptions();
	await runBatch(opts);
}

main().catch((err) => {
	console.error('❌ Ошибка:', err);
	process.exit(1);
});

/**
 * Парсит именованные аргументы с помощью util.parseArgs
 */
function parseNamedOptions(argv = process.argv.slice(2)) {
	const options = CLI_OPTIONS;

	const { values, positionals } = parseArgs({
		args: argv,
		options,
		allowPositionals: true,
		allowNegative: false, // если нужно --no-xxx
		strict: true, // кидает ошибку на неизвестные флаги
	});

	const opts = {};

	if (values.help) {
		printHelp();
		process.exit(0);
	}

	if (values.recurse !== undefined) opts.recurse = values.recurse;
	if (values.force !== undefined) opts.force = values.force;
	if (values.whisper !== undefined) opts.whisper = values.whisper;
	if (values.model !== undefined) opts.model = values.model;
	if (values.input !== undefined) opts.input = values.input;
	if (values.lang !== undefined) opts.lang = values.lang;
	if (values.threads !== undefined) {
		opts.threads = parseInt(values.threads, 10);
	}

	// Поддержка --whisper-exe (алиас)
	// parseArgs не поддерживает алиасы автоматически, поэтому вручную
	// Если нужно — можно добавить проверку по positionals или вручную

	// Resolve input dir
	if (opts.input && !path.isAbsolute(opts.input)) {
		opts.input = path.join(__dirname, opts.input);
	}

	return opts;
}

function printHelp() {
	console.log(`
whisper-generator — batch transcription + clickable HTML

Usage:
  npm start -- [options]
  npm start --input ./audio --lang ru --threads 8 -r
`);
	for (const [name, opt] of Object.entries(CLI_OPTIONS)) {
		const short = opt.short ? `-${opt.short}, ` : '    ';
		const typeInfo = opt.type === 'boolean' ? '' : ` <${opt.type}>`;
		console.log(`  ${short}--${name}${typeInfo}`);
		if (opt.desc) {
			console.log(`      ${opt.desc}`);
		}
	}
}

function printLine(sym = '-') {
	console.log(sym.repeat(50));
}
