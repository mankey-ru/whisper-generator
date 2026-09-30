#!/usr/bin/env node
// @ts-check

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { inspect } from 'node:util';

import { parseWhisperSegments } from './lib/segment-parser.mjs';
import { generateTranscriptHTML } from './lib/html-generator.mjs';
import { parseNamedOptions } from './lib/cli-options.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @param {string} p
 * @returns {Promise<boolean>}
 */
async function fileExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

/** @type {readonly string[]} */
const AUDIO_EXTS = ['.mp3', '.m4a', '.ogg', '.flac', '.aac', '.mp4']; // , '.wav'

/**
 * @param {string} dir
 * @param {boolean} recurse
 * @returns {Promise<string[]>}
 */
async function findAudioFiles(dir, recurse) {
	/** @type {string[]} */
	const results = [];
	/**
	 * @param {string} current
	 * @returns {Promise<void>}
	 */
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

/**
 * @param {string} cmd
 * @param {readonly string[]} args
 * @param {{ cwd?: string }} [options]
 * @returns {Promise<number>}
 */
function runCmd(cmd, args, options = {}) {
	console.log(
		`\tRunning command${options.cwd ? ` (cwd: ${options.cwd})` : ''}:\n\t\t${cmd} ${args.join(' ')}`,
	);
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { stdio: 'inherit', cwd: options.cwd });
		child.on('error', (/** @type {Error} */ err) => {
			console.error(`Failed to launch ${cmd}:`, err.message);
			resolve(1);
		});
		child.on('close', (/** @type {number | null} */ code) => {
			resolve(code ?? 1);
		});
	});
}

/**
 * Конвертирует inputFile в wavFile с помощью ffmpeg, если wavFile не существует.
 * @param {string} inputFile
 * @param {string} wavFile
 * @returns {Promise<boolean>} файл wavFile существует или успешно создан
 */
async function ensureWav(inputFile, wavFile) {
	if (await fileExists(wavFile)) return true;
	console.log('\tConverting to WAV...');

	const inputFileExt = path.extname(inputFile).toLowerCase();

	// AAC которые записаны рекордером андроида (конкретно NotingOS) пишутся в Raw AAC 
	// и нуждаются в явном указании формата и всё равно выдают ошибки
	// Input buffer exhausted before END element found	и 	Error submitting packet to decoder: Invalid data found when processing input
	// но теряются какие-то миллисекунды
	// prettier-ignore
	const aacArgs = inputFileExt === '.aac' ? [	
			'-f', 'aac',
			//'-analyzeduration', '2147483647',
			//'-probesize', '2147483647',
	] : [];

	// prettier-ignore
	const args = [
		// inputFileExt === '.aac' && ...aacArgs,
		'-i', inputFile,       // входной файл
		'-ar', '16000',        // частота дискретизации: 16 кГц
		'-ac', '1',            // количество каналов: моно
		'-c:a', 'pcm_s16le',   // аудиокодек: PCM 16-bit little-endian
		wavFile,               // выходной файл
		'-y',                  // перезаписать без подтверждения		
		...aacArgs,
	];
	const exitCode = await runCmd('ffmpeg', args);
	if (exitCode !== 0) {
		console.error('\t❌ ffmpeg conversion failed');
	}
	return exitCode === 0;
}

/**
 * Собирает argv для whisper-cli: пары [flag, value], одиночные флаги и условные группы.
 * @param {string} wavFile
 * @param {import('./types.js').CliOptions} opts
 * @returns {string[]}
 */
function buildWhisperArgs(wavFile, opts) {

	// Long names from `whisper-cli --help`
	return [
		['--model', opts.model],
		['--file', wavFile],
		['--language', opts.lang],
		['--max-context', 32],
		['--threads', opts.threads],

		// full JSON needed for token probabilities when colouring HTML
		opts.colors ? '--output-json-full' : '--output-json',
		// '--output-txt',
		'--print-progress',
		opts.colors && '--print-colors',

		opts.vadModel && [
			'--vad',
			['--vad-model', opts.vadModel],
			['--vad-min-silence-duration-ms', 1200],
			['--vad-min-speech-duration-ms', 300],
			// '--output-srt',
			// ['--output-file', 'output'],
		],
	]
		.flat(Infinity)
		.filter((x) => x !== false && x != null)
		.map(String);
}

/**
 * Запускает whisper-cli для wavFilePath и кладёт результат в jsonFilePath.
 *
 * whisper-cli на Windows получает argv в ANSI-кодировке, и не-ASCII символы в пути
 * (например, кириллица) превращаются в '?'. Поэтому запускаем его с cwd = папка файла
 * и относительным именем, а не-ASCII имя wav на время работы переименовываем в ASCII.
 * @param {string} wavFilePath
 * @param {string} jsonFilePath
 * @param {import('./types.js').CliOptions} opts
 * @returns {Promise<boolean>}
 */
async function runWhisper(wavFilePath, jsonFilePath, opts) {
	console.log('\tRunning whisper.cpp...');
	const dir = path.dirname(wavFilePath);
	const wavFileName = path.basename(wavFilePath);
	const isAsciiName = /^[\x20-\x7e]+$/.test(wavFileName);
	const whisperWavName = isAsciiName ? wavFileName : `whisper-tmp-${process.pid}.wav`;
	const whisperWavPath = path.join(dir, whisperWavName);

	if (!isAsciiName) await fs.rename(wavFilePath, whisperWavPath);
	try {
		const code = await runCmd(opts.whisper, buildWhisperArgs(whisperWavName, opts), { cwd: dir });
		if (code !== 0) return false;

		// whisper-cli пишет результат в <file>.wav.json, переименовываем в нужное имя
		await fs.rename(`${whisperWavPath}.json`, jsonFilePath);
		return true;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`\t❌ Failed to get whisper JSON: ${message}`);
		return false;
	} finally {
		if (!isAsciiName) await fs.rename(whisperWavPath, wavFilePath);
	}
}

/**
 * @param {string} jsonFilePath
 * @param {string} htmlFilePath
 * @param {string} originalFileName
 * @param {Partial<Pick<import('./types.js').CliOptions, 'colors'>>} [opts]
 * @returns {Promise<boolean>}
 */
async function generateHtmlForFile(jsonFilePath, htmlFilePath, originalFileName, opts = {}) {
	if (!(await fileExists(jsonFilePath))) {
		console.warn(
			`\t ⚠️ JSON file not found: ${path.basename(jsonFilePath)}, skipping HTML generation`,
		);
		return false;
	}
	// console.log(`\tGenerating HTML for: ${path.basename(jsonFilePath)}`);
	try {
		const jsonRaw = await fs.readFile(jsonFilePath, 'utf8');
		/** @type {import('./types.js').WhisperJson} */
		const json = JSON.parse(jsonRaw);
		const segments = parseWhisperSegments(json);
		if (segments.length === 0) return false;

		const html = generateTranscriptHTML(segments, originalFileName, {
			colors: opts.colors !== false,
		});
		await fs.writeFile(htmlFilePath, html, 'utf8');
		console.log(`\t✅ Generated HTML: ${path.basename(htmlFilePath)}`);
		return true;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`\t❌ Failed to generate HTML: ${message}`);
		return false;
	}
}

/**
 * @param {import('./types.js').CliOptions} opts
 * @returns {Promise<void>}
 */
async function runBatch(opts) {
	const inputDir = opts.input;

	await fs.mkdir(inputDir, { recursive: true });

	const files = await findAudioFiles(inputDir, opts.recurse);

	if (files.length === 0) {
		console.log(`No input files found in ${inputDir}`);
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
		printLine('=');

		const txtExists = true; //await fileExists(txtFilePath);
		const jsonExists = await fileExists(jsonFilePath);
		if (!txtExists || !jsonExists || opts.force) {
			// console.log(`..........Processing: ${originalFileName}`);
			const wavFileOk = await ensureWav(originalFilePath, wavFilePath);
			if (wavFileOk) {
				if (await ensureWav(originalFilePath, wavFilePath)) {
					const whisperOk = await runWhisper(wavFilePath, jsonFilePath, opts);
					if (!whisperOk) {
						console.error(
							`\t❌ Whisper failed for ${wavFilePath} (${originalFileName}), skipping this file`,
						);
						continue;
					}
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

		// prettier-ignore
		const htmlOk = await generateHtmlForFile(
			jsonFilePath,
			htmlFilePath,
			originalFileName,
			opts,
		);
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

/**
 * @param {import('./types.js').CliOptions} opts
 * @returns {void}
 */
function printBanner(opts) {
	const logo = `
 _       ____    _                      ______         
| |     / / /_  (_)________  ___  _____/ ____/__  ____ 
| | /| / / __ \\/ / ___/ __ \\/ _ \\/ ___/ / __/ _ \\/ __ \\
| |/ |/ / / / / (__  ) /_/ /  __/ /  / /_/ /  __/ / / /
|__/|__/_/ /_/_/____/ .___/\\___/_/   \\____/\\___/_/ /_/ 
                   /_/                                 
`;
	console.log(logo);
	console.log('  Whisper Generator — batch transcription → clickable HTML');
	printLine('=');
	console.log('Options:');
	/** @type {(keyof import('./types.js').CliOptions)[]} */
	const keys = [
		'input',
		'recurse',
		'force',
		'keep',
		'colors',
		'lang',
		'threads',
		'whisper',
		'model',
	];
	for (const key of keys) {
		const value = opts[key];
		console.log(`\t${String(key).padEnd(10)} ${inspect(value, { colors: true, compact: true })}`);
	}
	printLine('=');
	console.log();
}

/**
 * @returns {Promise<void>}
 */
async function main() {
	const opts = parseNamedOptions();
	// Resolve input dir relative to this script (preserves previous behavior)
	if (opts.input && !path.isAbsolute(opts.input)) {
		opts.input = path.join(__dirname, opts.input);
	}
	printBanner(opts);
	await runBatch(opts);
}

main().catch((err) => {
	console.error('❌ Ошибка:', err);
	process.exit(1);
});

/**
 * @param {string} [sym]
 * @returns {void}
 */
function printLine(sym = '-') {
	console.log(sym.repeat(50));
}
