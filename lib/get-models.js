// @ts-check

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import config from '../config.js';

/**
 * @param {string} filePath
 */
async function fileExists(filePath) {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Runtime check: config.js is user-edited and loaded without tsc
 * @param {import('../types.js').AppConfig} config
 */
function assertConfig(config) {
	if (!config.whisperDir || !Array.isArray(config.models)) {
		throw new Error('config.js: нужны whisperDir и models[]');
	}
	const keys = new Set();
	for (const model of config.models) {
		if (!model.key || !model.name || !model.sourceType || !model.sourceParams) {
			throw new Error(`модель без key/name/sourceType/sourceParams: ${model.key ?? model.name ?? '?'}`);
		}
		if (keys.has(model.key)) {
			throw new Error(`дублируется key: ${model.key}`);
		}
		keys.add(model.key);
		if (model.sourceType === 'URL') {
			if (typeof model.sourceParams.url !== 'string' || !model.sourceParams.url) {
				throw new Error(`${model.key}: URL требует sourceParams.url`);
			}
			continue;
		}
		if (model.sourceType === 'QUANTIZE') {
			const { keyFrom, cliOpts } = model.sourceParams;
			if (typeof keyFrom !== 'string' || !keyFrom) {
				throw new Error(`${model.key}: QUANTIZE требует sourceParams.keyFrom`);
			}
			if (!Array.isArray(cliOpts) || cliOpts.some((opt) => typeof opt !== 'string')) {
				throw new Error(`${model.key}: QUANTIZE требует sourceParams.cliOpts: string[]`);
			}
			continue;
		}
		const unknownModel = /** @type {{ key: string, sourceType: string }} */ (model);
		throw new Error(`${unknownModel.key}: неизвестный sourceType ${unknownModel.sourceType}`);
	}
	for (const model of config.models) {
		if (model.sourceType !== 'QUANTIZE') {
			continue;
		}
		if (!keys.has(model.sourceParams.keyFrom)) {
			throw new Error(`для генерации ${model.key}: отсутствует исходная keyFrom=${model.sourceParams.keyFrom}`);
		}
	}
}

/**
 * @param {string} url
 * @param {string} dest
 */
async function downloadFile(url, dest) {
	const part = `${dest}.part`;
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new Error(`скачивание не удалось: ${dest} (${response.status})`);
	}
	try {
		await pipeline(Readable.fromWeb(response.body), createWriteStream(part));
		await rename(part, dest);
	} catch (error) {
		await rm(part, { force: true });
		throw error;
	}
}

/**
 * @param {string} quantizeExe
 * @param {string} src
 * @param {string} dest
 * @param {string[]} cliOpts
 * @returns {Promise<void>}
 */
function runQuantize(quantizeExe, src, dest, cliOpts) {
	return new Promise((resolve, reject) => {
		const child = spawn(quantizeExe, [src, dest, ...cliOpts], { stdio: 'inherit' });
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`quantize завершился с кодом ${code}: ${path.basename(dest)}`));
		});
	});
}


/**
 * @param {string} key
 * @param {{ modelsDir: string, quantizeExe: string }} paths
 * @param {Map<string, import('../types.js').ModelConfig>} byKey
 * @param {Set<string>} ready
 */
async function ensureModel(key, paths, byKey, ready) {
	if (ready.has(key)) {
		return;
	}
	if (ready.has(`pending:${key}`)) {
		throw new Error(`цикл зависимостей на ${key}`);
	}
	const model = byKey.get(key);
	if (!model) {
		throw new Error(`нет модели ${key}`);
	}
	ready.add(`pending:${key}`);

	if (model.skip) {
		console.log(`пропускаем ${model.key} ${model.name}`);
		ready.add(key);
		return;
	}

	const dest = path.join(paths.modelsDir, model.name);
	if (await fileExists(dest)) {
		console.log(`уже существует ${model.key} ${model.name}`);
		ready.add(key);
		return;
	}

	if (model.sourceType === 'URL') {
		console.log(`скачивание ${model.key} ${model.name}`);
		await downloadFile(model.sourceParams.url, dest);
		ready.add(key);
		return;
	}

	await ensureModel(model.sourceParams.keyFrom, paths, byKey, ready);
	// ensureModel above throws when keyFrom is missing
	const srcModel = /** @type {import('../types.js').ModelConfig} */ (byKey.get(model.sourceParams.keyFrom));
	const src = path.join(paths.modelsDir, srcModel.name);
	if (!(await fileExists(src))) {
		throw new Error(`${model.key}: нет исходника ${src}`);
	}
	console.log(`quantize ${model.key} ${model.name} <- ${srcModel.key} ${model.sourceParams.cliOpts.join(' ')}`);
	await runQuantize(paths.quantizeExe, src, dest, model.sourceParams.cliOpts);
	ready.add(key);
}

async function main() {
	assertConfig(config);
	const paths = {
		modelsDir: path.join(config.whisperDir, 'models'),
		quantizeExe: path.join(config.whisperDir, 'build', 'bin', 'quantize.exe'),
	};
	await mkdir(paths.modelsDir, { recursive: true });

	const byKey = new Map(config.models.map((model) => [model.key, model]));
	/** @type {Set<string>} */
	const ready = new Set();
	for (const model of config.models) {
		await ensureModel(model.key, paths, byKey, ready);
	}
}

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
