import path from 'path';
import { toSRTTime } from './timestamp-utils.mjs';

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.m4v', '.ogv']);

const MEDIA_MIME = {
	'.mp3': 'audio/mpeg',
	'.m4a': 'audio/mp4',
	'.ogg': 'audio/ogg',
	'.oga': 'audio/ogg',
	'.flac': 'audio/flac',
	'.aac': 'audio/aac',
	'.wav': 'audio/wav',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mkv': 'video/webm',
	'.mov': 'video/quicktime',
	'.m4v': 'video/mp4',
	'.ogv': 'video/ogg',
};

/** Paul Tol palette used by whisper.cpp k_colors (red → green by confidence) */
const CONFIDENCE_COLORS = [
	'rgb(220, 5, 12)',
	'rgb(232, 96, 28)',
	'rgb(241, 147, 45)',
	'rgb(246, 193, 65)',
	'rgb(247, 240, 86)',
	'rgb(144, 201, 135)',
	'rgb(78, 178, 101)',
];

function getMediaInfo(originalFileName) {
	const ext = path.extname(originalFileName).toLowerCase();
	const isVideo = VIDEO_EXTS.has(ext);
	const mime = MEDIA_MIME[ext] || (isVideo ? 'video/mp4' : 'audio/mpeg');
	return { isVideo, mime, tag: isVideo ? 'video' : 'audio' };
}

function buildPlayerMarkup({ tag, playerAttrs, originalFileName, mime, mediaLabel }) {
	return `<${tag} ${playerAttrs}>
				<source src="${originalFileName}" type="${mime}">
				Твой браузер не поддерживает HTML5 ${mediaLabel}.
			</${tag}>`;
}

function buildBottomBar(originalFileName) {
	return `<div id="bottombar" class="grid grid-cols-3 items-center gap-3 mt-2 text-base text-zinc-300">
				<div class="truncate min-w-0" title="${originalFileName}">${originalFileName}</div>
				<div class="flex items-center justify-center gap-2 select-none">
					<button type="button" id="seek-rw"
							class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-200 leading-none"
							title="−1с (удерживай — ускорение)">
						&#x23EA;
					</button>
					<button type="button" id="seek-ff"
							class="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700 text-zinc-200 leading-none"
							title="+1с (удерживай — ускорение)">
						&#x23E9;
					</button>
				</div>
				<div class="flex justify-end min-w-0">
					<a id="current-time" href="?t=0"
					   class="font-mono tabular-nums text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline shrink-0"
					   title="Клик — копировать ссылку с таймкодом"></a>
				</div>
			</div>`;
}

function buildAudioBody({ playerMarkup, originalFileName }) {
	return `<div class="max-w-5xl mx-auto p-6">
		<div class="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
			${playerMarkup}
			${buildBottomBar(originalFileName)}
		</div>

		<div class="flex items-center justify-between gap-3 mb-3 px-1">
			<div class="flex items-center gap-2 min-w-0">
				<h2 class="text-base font-medium text-zinc-300">Транскрипция</h2>
				<label class="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none">
					<input id="follow" type="checkbox" checked class="rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-emerald-600 focus:ring-offset-0">
					follow
				</label>
				<button id="export-srt"
						class="px-1.5 py-0.5 text-xs leading-none bg-emerald-700/80 hover:bg-emerald-600 active:bg-emerald-700 rounded font-medium transition-colors">
					SRT
				</button>
			</div>
			<input id="search" type="text" placeholder="Поиск по тексту..."
				   class="bg-zinc-900 border border-zinc-700 text-sm rounded-xl px-4 py-2 w-72 focus:outline-none focus:border-emerald-600">
		</div>

		<div id="transcript" class="space-y-1 max-h-[68vh] overflow-y-auto pr-2 border border-zinc-800 rounded-2xl p-2 bg-zinc-900">
			<!-- сегменты рендерятся через JS -->
		</div>
	</div>`;
}

function buildVideoBody({ playerMarkup, originalFileName }) {
	return `<div class="w-full h-screen p-4 flex flex-col gap-3 overflow-hidden">
		<div class="flex flex-1 gap-4 min-h-0">
			<div class="w-[85%] min-w-0 flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-3">
				${playerMarkup}
				${buildBottomBar(originalFileName)}
			</div>

			<div class="w-[15%] min-w-0 flex flex-col min-h-0">
				<div class="shrink-0 mb-2 space-y-1.5">
					<div class="flex items-center gap-1.5 min-w-0">
						<h2 class="text-sm font-medium text-zinc-300 shrink-0">Транскрипция</h2>
						<label class="flex items-center gap-1 text-xs text-zinc-400 cursor-pointer select-none shrink-0">
							<input id="follow" type="checkbox" checked class="size-3.5 rounded border-zinc-600 bg-zinc-900 text-emerald-600 focus:ring-0 focus:ring-offset-0">
							follow
						</label>
						<button id="export-srt"
								class="ml-auto px-1.5 py-0.5 text-xs leading-none bg-emerald-700/80 hover:bg-emerald-600 active:bg-emerald-700 rounded font-medium transition-colors shrink-0">
							SRT
						</button>
					</div>
					<input id="search" type="text" placeholder="Поиск..."
						   class="w-full bg-zinc-900 border border-zinc-700 text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-600">
				</div>
				<div id="transcript" class="flex-1 min-h-0 space-y-1 overflow-y-auto border border-zinc-800 rounded-2xl p-2 bg-zinc-900">
					<!-- сегменты рендерятся через JS -->
				</div>
			</div>
		</div>
	</div>`;
}

/**
 * Генерирует полностью самостоятельный HTML с плеером и кликабельной транскрипцией
 * @param {Array} segments
 * @param {string} originalFileName
 * @param {{ object }} options
 */
export function generateTranscriptHTML(segments, originalFileName, options = {}) {
	const printColours = options.colors !== false;
	const segmentsJSON = JSON.stringify(segments);
	const { isVideo, mime, tag } = getMediaInfo(originalFileName);
	const mediaLabel = isVideo ? 'видео' : 'аудио';
	const playerAttrs = isVideo
		? 'id="player" class="w-full flex-1 min-h-0 rounded-xl bg-black object-contain" controls playsinline'
		: 'id="player" class="w-full" controls';
	const playerMarkup = buildPlayerMarkup({
		tag,
		playerAttrs,
		originalFileName,
		mime,
		mediaLabel,
	});
	const bodyMarkup = isVideo
		? buildVideoBody({ playerMarkup, originalFileName })
		: buildAudioBody({ playerMarkup, originalFileName });
	const segmentLayoutClass = isVideo
		? 'segment flex flex-col gap-1 px-2 py-2 rounded-xl border border-transparent cursor-pointer group'
		: 'segment flex gap-4 items-start px-4 py-3 rounded-xl border border-transparent cursor-pointer group';
	const timeClass = isVideo
		? 'font-mono text-emerald-400 text-xs tabular-nums group-hover:text-emerald-300 transition-colors'
		: 'font-mono text-emerald-400 text-sm tabular-nums w-16 shrink-0 pt-0.5 group-hover:text-emerald-300 transition-colors';
	const textClass = isVideo
		? 'text-sm leading-snug break-words'
		: 'flex-1 text-[15px] leading-snug';

	return `<!DOCTYPE html>
<html lang="ru">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>${originalFileName} - Кликабельная транскрипция</title>
	<script src="https://cdn.tailwindcss.com"><\/script>
	<style>
		.segment { transition: all 0.1s ease; }
		.segment.active { 
			background-color: #166534; 
			border-color: #4ade80;
			box-shadow: 0 0 0 1px #4ade80;
		}
		.segment:hover { background-color: #27251f; }
		#transcript { scrollbar-width: thin; }
		.tok { /* confidence-coloured token */ }
		#seek-rw, #seek-ff { font-size: 1.05em; line-height: 1; touch-action: none; }
	</style>
</head>
<body class="bg-zinc-950 text-zinc-200">
	${bodyMarkup}

	<script>
		const segmentsData = ${segmentsJSON};
		const PRINT_COLOURS = ${printColours ? 'true' : 'false'};
		const CONFIDENCE_COLORS = ${JSON.stringify(CONFIDENCE_COLORS)};
		const MEDIA_NAME = ${JSON.stringify(originalFileName)};
		const STORAGE_KEY = 'whisper-transcript:' + MEDIA_NAME;

		let player;
		let currentActiveEl = null;

		function formatTime(sec) {
			const h = Math.floor(sec / 3600);
			const m = Math.floor((sec % 3600) / 60);
			const s = Math.floor(sec % 60);
			return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
		}

		/** YouTube-like stamp: 12 | 1m05s | 1h01m45s */
		function formatTimeParam(sec) {
			sec = Math.max(0, Math.floor(sec || 0));
			const h = Math.floor(sec / 3600);
			const m = Math.floor((sec % 3600) / 60);
			const s = sec % 60;
			if (h > 0) {
				return h + 'h' + String(m).padStart(2, '0') + 'm' + String(s).padStart(2, '0') + 's';
			}
			if (m > 0) {
				return m + 'm' + String(s).padStart(2, '0') + 's';
			}
			return String(s);
		}

		/** Parse t=12 or t=1h01m45s (also plain 12 / 1h01m45s) */
		function parseTimeParam(raw) {
			if (raw == null) return null;
			let v = String(raw).trim();
			if (!v) return null;
			if (/^t=/i.test(v)) v = v.slice(2);
			if (/^\\d+(?:\\.\\d+)?$/.test(v)) return parseFloat(v);
			const m = v.match(/^(?:(\\d+)h)?(?:(\\d+)m)?(?:(\\d+(?:\\.\\d+)?)s)?$/i);
			if (!m || (m[1] == null && m[2] == null && m[3] == null)) return null;
			return (parseInt(m[1] || '0', 10) * 3600)
				+ (parseInt(m[2] || '0', 10) * 60)
				+ parseFloat(m[3] || '0');
		}

		function readTimeFromUrl() {
			const params = new URLSearchParams(location.search);
			if (params.has('t')) return parseTimeParam(params.get('t'));
			// fallback for older #t= links
			const hash = (location.hash || '').replace(/^#/, '');
			if (/^t=/i.test(hash)) return parseTimeParam(hash);
			const frag = hash.match(/^t=([^&,]+)/i);
			return frag ? parseTimeParam(frag[1]) : null;
		}

		function timeLinkUrl(sec) {
			const url = new URL(location.href);
			url.searchParams.set('t', formatTimeParam(sec));
			url.hash = '';
			return url.href;
		}

		function updateTimeLink(sec) {
			const timeEl = document.getElementById('current-time');
			if (!timeEl) return;
			const stamp = formatTimeParam(sec);
			timeEl.textContent = formatTime(sec);
			const url = new URL(location.href);
			url.searchParams.set('t', stamp);
			url.hash = '';
			// relative href keeps right-click "Copy link" working with ?t=
			timeEl.setAttribute('href', '?' + url.searchParams.toString());
		}

		function scrollActiveToCenter(el) {
			const container = document.getElementById('transcript');
			if (!container || !el) return;
			const cRect = container.getBoundingClientRect();
			const eRect = el.getBoundingClientRect();
			const delta = (eRect.top + eRect.height / 2) - (cRect.top + cRect.height / 2);
			container.scrollBy({ top: delta, behavior: 'smooth' });
		}

		function escapeHtml(s) {
			return String(s)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		}

		function confidenceColor(p) {
			const n = CONFIDENCE_COLORS.length;
			let col = Math.floor(Math.pow(Math.max(0, Math.min(1, p)), 3) * n);
			if (col < 0) col = 0;
			if (col > n - 1) col = n - 1;
			return CONFIDENCE_COLORS[col];
		}

		function formatSegmentText(seg) {
			if (PRINT_COLOURS && Array.isArray(seg.tokens) && seg.tokens.length) {
				return seg.tokens.map(t => {
					const color = confidenceColor(typeof t.p === 'number' ? t.p : 1);
					const title = typeof t.p === 'number' ? ('p=' + t.p.toFixed(3)) : '';
					return '<span class="tok" style="color:' + color + '" title="' + title + '">' + escapeHtml(t.text) + '</span>';
				}).join('');
			}
			return '<span class="text-zinc-100">' + escapeHtml(seg.text) + '</span>';
		}

		function createSegmentElement(seg) {
			const div = document.createElement('div');
			div.id = seg.id;
			div.className = '${segmentLayoutClass}';
			div.innerHTML = \`
				<div class="${timeClass}">
					\${seg.timeStr}
				</div>
				<div class="${textClass}">\${formatSegmentText(seg)}</div>
			\`;

			div.addEventListener('click', () => {
				if (!player) return;
				player.currentTime = seg.start;
				player.play().catch(() => {});
			});
			return div;
		}

		function renderTranscript(filtered = segmentsData) {
			const container = document.getElementById('transcript');
			container.innerHTML = '';
			filtered.forEach(seg => {
				const el = createSegmentElement(seg);
				seg.el = el;
				container.appendChild(el);
			});
		}

		function setupSearch() {
			const input = document.getElementById('search');
			input.addEventListener('input', () => {
				const q = input.value.toLowerCase().trim();
				const filtered = q 
					? segmentsData.filter(s => s.text.toLowerCase().includes(q))
					: segmentsData;
				renderTranscript(filtered);
			});
		}

		function setupExportSRT() {
			document.getElementById('export-srt').addEventListener('click', () => {
				let srtContent = '';
				segmentsData.forEach((seg, i) => {
					const start = toSRTTime ? toSRTTime(seg.start) : formatTime(seg.start);
					const end   = toSRTTime ? toSRTTime(seg.end)   : formatTime(seg.end);
					srtContent += \`\${i + 1}\\n\${start} --> \${end}\\n\${seg.text}\\n\\n\`;
				});
				const blob = new Blob([srtContent], { type: 'text/plain' });
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = '${originalFileName.replace(/\.[^/.]+$/, '')}.srt';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			});
		}

		function isFollowEnabled() {
			const el = document.getElementById('follow');
			return !el || el.checked;
		}

		function setupHighlighting() {
			player = document.getElementById('player');

			player.addEventListener('timeupdate', () => {
				const t = player.currentTime;
				updateTimeLink(t);

				let active = null;
				for (const seg of segmentsData) {
					if (t >= seg.start && t < seg.end) { active = seg; break; }
				}

				if (active && active.el) {
					const changed = currentActiveEl !== active.el;
					if (currentActiveEl && changed) {
						currentActiveEl.classList.remove('active');
					}
					active.el.classList.add('active');
					currentActiveEl = active.el;

					if (changed && isFollowEnabled() && !player.paused) {
						scrollActiveToCenter(active.el);
					}
				}
			});

			player.addEventListener('pause', () => {
				if (currentActiveEl) {
					currentActiveEl.classList.remove('active');
					currentActiveEl = null;
				}
			});
		}

		function setupTimeLink() {
			const timeEl = document.getElementById('current-time');
			if (!timeEl) return;

			updateTimeLink(player ? player.currentTime : 0);

			timeEl.addEventListener('click', async (e) => {
				e.preventDefault();
				const sec = player ? player.currentTime : 0;
				const url = timeLinkUrl(sec);
				updateTimeLink(sec);
				try {
					await navigator.clipboard.writeText(url);
					const prev = timeEl.getAttribute('title');
					timeEl.setAttribute('title', 'Скопировано');
					setTimeout(() => timeEl.setAttribute('title', prev || 'Клик — копировать ссылку с таймкодом'), 1200);
				} catch (err) {
					console.warn('[transcript] clipboard failed', err);
				}
			});
		}

		function loadPlaybackState() {
			try {
				const raw = sessionStorage.getItem(STORAGE_KEY);
				if (!raw) return null;
				const data = JSON.parse(raw);
				if (!data || typeof data !== 'object') return null;
				return data;
			} catch (_) {
				return null;
			}
		}

		function savePlaybackState() {
			if (!player) return;
			try {
				sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
					currentTime: player.currentTime || 0,
					playbackRate: player.playbackRate || 1,
				}));
			} catch (_) {}
		}

		/** YouTube-style: drop t from the address bar after it has been applied */
		function stripTimeFromUrl() {
			const url = new URL(location.href);
			let changed = false;
			if (url.searchParams.has('t')) {
				url.searchParams.delete('t');
				changed = true;
			}
			const hashBody = (url.hash || '').replace(/^#/, '');
			if (/^t=/i.test(hashBody)) {
				url.hash = '';
				changed = true;
			}
			if (!changed) return;
			const next = url.pathname + url.search + (url.hash || '');
			history.replaceState(null, '', next || url.pathname);
		}

		function setupPlaybackPersistence() {
			if (!player) return;
			let saveTimer = null;
			const scheduleSave = () => {
				if (saveTimer) clearTimeout(saveTimer);
				saveTimer = setTimeout(savePlaybackState, 250);
			};
			player.addEventListener('timeupdate', scheduleSave);
			player.addEventListener('ratechange', savePlaybackState);
			player.addEventListener('pause', savePlaybackState);
			player.addEventListener('seeked', savePlaybackState);
			window.addEventListener('beforeunload', savePlaybackState);
			window.addEventListener('pagehide', savePlaybackState);
		}

		/**
		 * Prefer ?t= / #t= once, then strip it. Otherwise restore sessionStorage.
		 * Always restore playbackRate from session when available.
		 */
		function applyStartPosition() {
			if (!player) return;
			const urlTime = readTimeFromUrl();
			const state = loadPlaybackState();

			const apply = () => {
				if (state && typeof state.playbackRate === 'number' && state.playbackRate > 0) {
					player.playbackRate = state.playbackRate;
				}
				if (urlTime != null) {
					player.currentTime = urlTime;
					updateTimeLink(urlTime);
					stripTimeFromUrl();
					savePlaybackState();
				} else if (state && typeof state.currentTime === 'number' && state.currentTime > 0) {
					player.currentTime = state.currentTime;
					updateTimeLink(state.currentTime);
				}
			};

			if (player.readyState >= 1) apply();
			else player.addEventListener('loadedmetadata', apply, { once: true });
		}

		/**
		 * Click = ±1s. Hold after 350ms repeats; step grows from 10:
		 * step = min(120, round(10 * 1.6^floor(heldSec / 0.7)))
		 * → ~10, 16, 26, 41, 66, 105, 120…
		 */
		function setupSeekButtons() {
			const CLICK_STEP = 1;
			const HOLD_BASE = 10;
			const HOLD_DELAY = 350;
			const TICK_MS = 130;

			function clampSeek(sec) {
				const dur = (player && isFinite(player.duration)) ? player.duration : Infinity;
				return Math.max(0, Math.min(dur, sec));
			}

			function seekBy(dir, amount) {
				if (!player) return;
				player.currentTime = clampSeek(player.currentTime + dir * amount);
				updateTimeLink(player.currentTime);
			}

			function holdStep(startTs) {
				const held = (Date.now() - startTs) / 1000;
				return Math.min(120, Math.round(HOLD_BASE * Math.pow(1.6, Math.floor(held / 0.7))));
			}

			function attach(btn, dir) {
				if (!btn) return;
				let holdTimer = null;
				let tickTimer = null;
				let startTs = 0;
				let didHold = false;
				let pointerId = null;

				function clear() {
					if (holdTimer) clearTimeout(holdTimer);
					if (tickTimer) clearInterval(tickTimer);
					holdTimer = null;
					tickTimer = null;
				}

				function onDown(e) {
					if (e.button != null && e.button !== 0) return;
					e.preventDefault();
					pointerId = e.pointerId;
					try { btn.setPointerCapture(pointerId); } catch (_) {}
					startTs = Date.now();
					didHold = false;
					clear();
					holdTimer = setTimeout(() => {
						didHold = true;
						seekBy(dir, holdStep(startTs));
						tickTimer = setInterval(() => seekBy(dir, holdStep(startTs)), TICK_MS);
					}, HOLD_DELAY);
				}

				function onUp(e) {
					if (pointerId != null && e.pointerId != null && e.pointerId !== pointerId) return;
					clear();
					try { if (pointerId != null) btn.releasePointerCapture(pointerId); } catch (_) {}
					pointerId = null;
					if (!didHold && startTs) seekBy(dir, CLICK_STEP);
					startTs = 0;
					didHold = false;
				}

				btn.addEventListener('pointerdown', onDown);
				btn.addEventListener('pointerup', onUp);
				btn.addEventListener('pointercancel', onUp);
				btn.addEventListener('lostpointercapture', () => {
					clear();
					startTs = 0;
					didHold = false;
					pointerId = null;
				});
				btn.addEventListener('contextmenu', (e) => e.preventDefault());
			}

			attach(document.getElementById('seek-rw'), -1);
			attach(document.getElementById('seek-ff'), +1);
		}

		function init() {
			renderTranscript();
			setupSearch();
			setupExportSRT();
			setupHighlighting();
			setupTimeLink();
			setupSeekButtons();
			setupPlaybackPersistence();
			applyStartPosition();
			window.addEventListener('popstate', applyStartPosition);

			document.addEventListener('keydown', (e) => {
				if (e.key === ' ' && document.activeElement.tagName !== 'INPUT') {
					e.preventDefault();
					player.paused ? player.play() : player.pause();
				}
				if ((e.key === 'f' || e.key === 'F') && document.activeElement.tagName !== 'INPUT') {
					e.preventDefault();
					document.getElementById('search').focus();
				}
			});

			console.log('%c[transcript] Готово. Сегментов: ' + segmentsData.length + (PRINT_COLOURS ? ' (colours on)' : ''), 'color:#4ade80');
		}

		init();
	<\/script>
</body>
</html>`;
}
