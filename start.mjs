#!/usr/bin/env node
// @ts-check

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { inspect } from 'node:util';

import { parseWhisperSegments } from './lib/segment-parser.mjs';
import { generateTranscriptHTML } from './lib/html-generator.mjs';
import { DEFAULT_WHISPER_DIR, parseNamedOptions } from './lib/cli-options.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fileExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

const AUDIO_EXTS = ['.mp3', '.m4a', '.ogg', '.flac', '.aac', '.mp4']; // , '.wav'

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
		'--output-json',
		// '--output-txt',
		'--print-progress',
	];
	const vadArgs = [
		'--vad',
		'--vad-model',
		`${DEFAULT_WHISPER_DIR}/models/ggml-silero-v6.2.0.bin`,
		'--vad-min-silence-duration-ms',
		'1200',
		'--vad-min-speech-duration-ms',
		'300',
		// -of of --
		// '-osrt', // включить вывод файла субтитров в формате SRT.
		//`--output-file "${path.basename(wavFile, path.extname(wavFile))}"`,
		//'--output-file',
		//'output'
	];
	if (opts.usevad) {
		args.push(...vadArgs);
	}
	const code = await runCmd(opts.whisper, args);
	return code === 0;
}

async function generateHtmlForFile(jsonFilePath, htmlFilePath, originalFileName) {
	if (!(await fileExists(jsonFilePath))) {
		console.warn(
			`\t ⚠️ JSON file not found: ${path.basename(jsonFilePath)}, skipping HTML generation`,
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
		console.error(`\t❌ Failed to generate HTML: ${err.message}`);
		return false;
	}
}

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
	const keys = ['input', 'recurse', 'force', 'keep', 'lang', 'threads', 'whisper', 'model'];
	for (const key of keys) {
		const value = opts[key];
		console.log(`  ${key.padEnd(10)} ${inspect(value, { colors: true, compact: true })}`);
	}
	printLine('=');
	console.log();
}

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

function printLine(sym = '-') {
	console.log(sym.repeat(50));
}
