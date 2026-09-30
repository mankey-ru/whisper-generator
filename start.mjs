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

/** Префикс папок с упакованными результатами; такие папки не обходятся при поиске исходников */
const OUT_DIR_PREFIX = '_OUT ';

/**
 * @param {string} filePath
 * @returns {boolean}
 */
function isAudioFile(filePath) {
	return AUDIO_EXTS.includes(path.extname(filePath).toLowerCase());
}

/**
 * Исходники для обработки: сам input, если это файл, иначе аудиофайлы в папке input.
 * @param {string} input
 * @param {boolean} recurse
 * @returns {Promise<string[]>}
 */
async function findInputFiles(input, recurse) {
	const stat = await fs.stat(input).catch(() => null);
	if (stat?.isFile()) {
		return isAudioFile(input) ? [input] : [];
	}
	await fs.mkdir(input, { recursive: true });
	return findAudioFiles(input, recurse);
}

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
				if (recurse && !entry.name.startsWith(OUT_DIR_PREFIX)) await walk(full);
			} else if (entry.isFile()) {
				if (isAudioFile(entry.name)) {
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
 * Метка запуска для имён папок _OUT, локальное время: `2026-10-01 14-30`
 * @param {Date} date
 * @returns {string}
 */
function formatRunStamp(date) {
	const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

/**
 * Создаёт рядом с исходником папку `_OUT [метка] <исходник> [модель]`, при совпадении — с суффиксом ` (2)`, ` (3)`...
 * @param {string} dir
 * @param {string} baseName
 * @returns {Promise<string>}
 */
async function createOutDir(dir, baseName) {
	for (let n = 1; ; n++) {
		const outDir = path.join(dir, n === 1 ? baseName : `${baseName} (${n})`);
		try {
			await fs.mkdir(outDir);
			return outDir;
		} catch (err) {
			if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'EEXIST') throw err;
		}
	}
}

/**
 * Упаковывает исходник, JSON и HTML в папку _OUT и удаляет промежуточный wav.
 * Исходник переносится первым: если он занят (например, открыт в плеере),
 * папка удаляется и всё остаётся рядом с исходником — следующий запуск упакует из кэша.
 * @param {{ originalFilePath: string, jsonFilePath: string, htmlFilePath: string, wavFilePath: string, outDirName: string }} files
 * @returns {Promise<string | null>} путь к папке или null, если упаковать не удалось
 */
async function packResult({ originalFilePath, jsonFilePath, htmlFilePath, wavFilePath, outDirName }) {
	const outDir = await createOutDir(path.dirname(originalFilePath), outDirName);
	/** @param {string} filePath */
	const moveIn = (filePath) => fs.rename(filePath, path.join(outDir, path.basename(filePath)));
	try {
		await moveIn(originalFilePath);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(
			`\t❌ Результат готов, но исходник не перенесён (закрой его и запусти ещё раз): ${message}`,
		);
		await fs.rmdir(outDir);
		return null;
	}
	await moveIn(jsonFilePath);
	await moveIn(htmlFilePath);
	await fs.rm(wavFilePath, { force: true });
	return outDir;
}

/**
 * @param {import('./types.js').CliOptions} opts
 * @returns {Promise<void>}
 */
async function runBatch(opts) {
	const inputDir = opts.input;
	const runStamp = formatRunStamp(new Date());
	/** @type {string[]} */
	const outDirs = [];

	const files = await findInputFiles(inputDir, opts.recurse);

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

		// рабочие файлы именуются с расширением исходника, чтобы a.mp3 и a.mp4 не делили a.wav/a.json
		const wavFileName = `${originalFileName}.wav`;
		const wavFilePath = path.join(dir, wavFileName);

		//const txtFileName = `${originalFileBaseName}.txt`;
		//const txtFilePath = path.join(dir, txtFileName);

		const jsonFileName = `${originalFileName}.json`;
		const jsonFilePath = path.join(dir, jsonFileName);

		const htmlFilePath = path.join(dir, `${originalFileName}.html`);

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
				// TODO: проверить, не мёртвый ли это код и нужен ли второй вызов ensureWav вообще:
				// wav к этому моменту уже создан первым вызовом, так что здесь он, похоже, всегда сразу возвращает true
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

		if (!opts.debug) {
			const outDir = await packResult({
				originalFilePath,
				jsonFilePath,
				htmlFilePath,
				wavFilePath,
				outDirName: `${OUT_DIR_PREFIX}[${runStamp}] ${originalFileName} [${opts.modelKey}]`,
			});
			if (!outDir) {
				continue;
			}
			outDirs.push(outDir);
			console.log(`\t📁 Packed: ${outDir}`);
		}

		console.log(`\t✅ File done: ${originalFileBaseName}`);
		printLine();
	}

	printLine('=');
	console.log('\n Processing complete.');
	if (outDirs.length > 0) {
		console.log(`\nResult folders (${outDirs.length}):`);
		for (const outDir of outDirs) {
			console.log(`\t${outDir}`);
		}
	}
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
		'debug',
		'colors',
		'lang',
		'threads',
		'whisper',
		'modelKey',
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
