#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';

import { parseWhisperSegments } from './lib/segment-parser.mjs';
import { generateTranscriptHTML } from './lib/html-generator.mjs';

async function main() {
	const audioPath = process.argv[2];
	const jsonPath  = process.argv[3];

	if (!audioPath || !jsonPath) {
		console.error('Использование:');
		console.error('  node generate-clickable-transcript.mjs <audio.mp3> <audio.json>');
		console.error('  или: npm run generate <audio.mp3> <audio.json>');
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

main().catch(err => {
	console.error('❌ Ошибка:', err);
	process.exit(1);
});
