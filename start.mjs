#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { inspect } from 'node:util';

import { parseWhisperSegments } from './lib/segment-parser.mjs';
import { generateTranscriptHTML } from './lib/html-generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUDIO_EXTS = ['.mp3', '.m4a', '.ogg', '.flac', '.aac']; // , '.wav'

// Defaults (override with env or CLI named options)

const DEFAULT_WHISPER_DIR = `C:\\whisper.cpp`;

const DEFAULTS = {
	whisper: process.env.WHISPER_EXE || `${DEFAULT_WHISPER_DIR}\\whisper-cli.exe`,
	model: process.env.WHISPER_MODEL || `${DEFAULT_WHISPER_DIR}\\models\\ggml-large-v3.bin`,
	input: 'input', // will be resolved relative to this script (inside project)
	lang: process.env.LANGUAGE || 'ru',
	threads: parseInt(process.env.THREADS || '12', 10),
	recurse: false,
};

function parseNamedOptions(argv) {
	const opts = { ...DEFAULTS };

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		if (arg === '--help' || arg === '-h') {
			printHelp();
			process.exit(0);
		}
		if (arg === '--recurse' || arg === '-r') {
			opts.recurse = true;
			continue;
		}
		if (arg.startsWith('--whisper=')) {
			opts.whisper = arg.split('=')[1];
			continue;
		}
		if (arg === '--whisper' || arg === '--whisper-exe') {
			opts.whisper = argv[++i];
			continue;
		}
		if (arg.startsWith('--model=')) {
			opts.model = arg.split('=')[1];
			continue;
		}
		if (arg === '--model') {
			opts.model = argv[++i];
			continue;
		}
		if (arg.startsWith('--input=')) {
			opts.input = arg.split('=')[1];
			continue;
		}
		if (arg === '--input') {
			opts.input = argv[++i];
			continue;
		}
		if (arg.startsWith('--lang=')) {
			opts.lang = arg.split('=')[1];
			continue;
		}
		if (arg === '--lang' || arg === '--language') {
			opts.lang = argv[++i];
			continue;
		}
		if (arg.startsWith('--threads=')) {
			opts.threads = parseInt(arg.split('=')[1], 10);
			continue;
		}
		if (arg === '--threads') {
			opts.threads = parseInt(argv[++i], 10);
			continue;
		}
	}

	// Resolve input dir relative to the project (script location) so it is "inside the project"
	if (!path.isAbsolute(opts.input)) {
		opts.input = path.join(__dirname, opts.input);
	}
	return opts;
}

function printHelp() {
	console.log(`
whisper-generator — batch transcription + clickable HTML

Usage:
  npm start
  npm start -- --recurse --lang=en
  npm start -- --whisper "C:\\whisper.cpp\\whisper-cli.exe" --model "C:\\whisper.cpp\\models\\ggml-large-v3.bin"
  npm start -- --input "./my-audio" -r

Options (named):
  --whisper, --whisper-exe   Path to whisper-cli.exe / whisper.cpp binary
  --model                    Path to the ggml model .bin
  --input                    Input directory (default: input/ inside this project)
  --lang, --language         Language code (default: ru)
  --threads                  Thread count (default: 12)
  --recurse, -r              Recurse into subdirectories
  --help, -h                 Show help

Legacy single-file HTML mode:
  npm start -- audio.mp3 audio.json
  node start.mjs audio.mp3 audio.json
`);
}

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
		console.error('  ffmpeg conversion failed');
	}
	return code === 0;
}

async function runWhisper(wavFile, opts) {
	console.log('  Running whisper.cpp...');
	const args = [
		'-m',
		opts.model,
		'-f',
		wavFile,
		'-l',
		opts.lang,
		'-t',
		String(opts.threads),
		'--output-txt',
		'--output-json',
		'--print-progress',
	];
	const code = await runCmd(opts.whisper, args);
	return code === 0;
}

async function generateHtmlForFile(dir, wavFile, originalAudioFilename) {
	const jsonFile = path.join(dir, wavFile + '.json');
	if (!(await fileExists(jsonFile))) {
		console.warn(`  ⚠️  JSON file not found: ${wavFile}.json`);
		return false;
	}

	try {
		const jsonRaw = await fs.readFile(jsonFile, 'utf8');
		const json = JSON.parse(jsonRaw);
		const segments = parseWhisperSegments(json);
		if (segments.length === 0) return false;

		const html = generateTranscriptHTML(segments, originalAudioFilename);
		const htmlFile = path.join(dir, wavFile + '.html');
		await fs.writeFile(htmlFile, html, 'utf8');
		console.log(`  ✅ Generated HTML: ${wavFile}.html`);
		return true;
	} catch (err) {
		console.warn('  ⚠️  Failed to generate HTML:', err.message);
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
	console.log('-------------------------------------------');

	for (const originalInputFilePath of files) {
		const dir = path.dirname(originalInputFilePath);
		const ext = path.extname(originalInputFilePath);
		/** Базовое имя inputFile (не wav) без расширения */
		const originalInputFileBaseName = path.basename(originalInputFilePath, ext);
		const originalInputFileName = path.basename(originalInputFilePath);
		const wavFileName = `${originalInputFileBaseName}.wav`;
		const wavFile = path.join(dir, wavFileName);

		const txtFileName = `${wavFileName}.txt`;
		const txtFilePath = path.join(dir, txtFileName);

		console.log(
			`\nProcessing: ${inspect(
				{
					wavFile,
					wavFileName,
					originalInputFileName,
					originalInputFileBaseName,
					txtFileName,
					txtFilePath,
				},
				{ colors: true, compact: false, depth: 2 },
			)}`,
		);

		if (await fileExists(txtFilePath)) {
			console.log(`\t▶ Processing: ${originalInputFileName}`);

			const wavFileOk = await ensureWav(originalInputFilePath, wavFile);
			if (wavFileOk) {
				if (await ensureWav(originalInputFilePath, wavFile)) {
					const whisperOk = await runWhisper(wavFile, opts);
					if (!whisperOk) {
						console.error(
							`\t❌ Whisper failed for ${wavFile} (${originalInputFileName}), skipping this file`,
						);
						continue;
					}
					// Generate clickable HTML next to the audio (using original filename for <audio src>)
					await generateHtmlForFile(dir, wavFile, originalInputFileName);
				} else {
					console.log(`\t Already transcribed): ${txtFilePath}`);
					continue;
				}
			} else {
				console.error(`\t❌ Failed to convert ${originalInputFileName} to WAV, skipping this file`);
				continue;
			}
		}

		console.log(`✓ Done: ${originalInputFileBaseName}`);
	}

	console.log('\nAll done!');
}

async function runSingle(audioPath, jsonPath) {
	if (!audioPath || !jsonPath) {
		console.error('Использование:');
		console.error('  node start.mjs <audio.mp3> <audio.json>');
		console.error('  или: npm start -- <audio.mp3> <audio.json>');
		process.exit(1);
	}

	const audioName = path.basename(audioPath);
	const jsonRaw = await fs.readFile(jsonPath, 'utf8');
	const json = JSON.parse(jsonRaw);

	const segments = parseWhisperSegments(json);

	if (segments.length === 0) {
		console.warn('⚠️  Не найдено ни одного сегмента в JSON');
	}

	const html = generateTranscriptHTML(segments, audioName);
	const outName = path.basename(audioPath, path.extname(audioPath)) + '.html';

	await fs.writeFile(outName, html, 'utf8');

	console.log(`✅ Создан файл: ${outName}`);
	console.log('   Положи его рядом с аудиофайлом и открой в браузере.');
}

async function main() {
	const argv = process.argv.slice(2);
	const nonFlagArgs = argv.filter((a) => !a.startsWith('-'));

	// Legacy single-file mode: node start.mjs audio.mp3 audio.json
	if (nonFlagArgs.length >= 2) {
		await runSingle(nonFlagArgs[0], nonFlagArgs[1]);
		return;
	}

	// Batch mode (default for npm start)
	const opts = parseNamedOptions(argv);
	await runBatch(opts);
}

main().catch((err) => {
	console.error('❌ Ошибка:', err);
	process.exit(1);
});
