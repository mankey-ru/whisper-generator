import { toSRTTime } from './timestamp-utils.mjs';

/**
 * Генерирует полностью самостоятельный HTML с плеером и кликабельной транскрипцией
 */
export function generateTranscriptHTML(segments, audioFilename) {
	const segmentsJSON = JSON.stringify(segments);

	return `<!DOCTYPE html>
<html lang="ru">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Кликабельная транскрипция — ${audioFilename}</title>
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
	</style>
</head>
<body class="bg-zinc-950 text-zinc-200">
	<div class="max-w-5xl mx-auto p-6">
		<header class="mb-6">
			<h1 class="text-3xl font-semibold tracking-tight">Кликабельная транскрипция</h1>
			<p class="text-zinc-400 mt-1 text-sm">${audioFilename}</p>
		</header>

		<div class="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
			<audio id="player" class="w-full" controls>
				<source src="${audioFilename}" type="audio/mpeg">
				Твой браузер не поддерживает HTML5 аудио.
			</audio>
			<div class="flex items-center justify-between mt-3 text-xs text-zinc-500">
				<div>Кликни по времени или строке — прыжок к моменту</div>
				<div id="current-time" class="font-mono tabular-nums"></div>
			</div>
		</div>

		<div class="flex items-center justify-between mb-3 px-1">
			<h2 class="text-xl font-semibold">Транскрипция</h2>
			<div class="flex items-center gap-3">
				<input id="search" type="text" placeholder="Поиск по тексту..." 
					   class="bg-zinc-900 border border-zinc-700 text-sm rounded-xl px-4 py-2 w-72 focus:outline-none focus:border-emerald-600">
				<button id="export-srt"
						class="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl font-medium transition-colors">
					Скачать SRT
				</button>
			</div>
		</div>

		<div id="transcript" class="space-y-1 max-h-[68vh] overflow-y-auto pr-2 border border-zinc-800 rounded-2xl p-2 bg-zinc-900">
			<!-- сегменты рендерятся через JS -->
		</div>
	</div>

	<script>
		const segmentsData = ${segmentsJSON};

		let player;
		let currentActiveEl = null;

		function formatTime(sec) {
			const h = Math.floor(sec / 3600);
			const m = Math.floor((sec % 3600) / 60);
			const s = Math.floor(sec % 60);
			return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
		}

		function createSegmentElement(seg) {
			const div = document.createElement('div');
			div.id = seg.id;
			div.className = 'segment flex gap-4 items-start px-4 py-3 rounded-xl border border-transparent cursor-pointer group';
			div.innerHTML = \`
				<div class="font-mono text-emerald-400 text-sm tabular-nums w-16 shrink-0 pt-0.5 group-hover:text-emerald-300 transition-colors">
					\${seg.timeStr}
				</div>
				<div class="flex-1 text-[15px] leading-snug text-zinc-100">\${seg.text}</div>
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
				a.download = '${audioFilename.replace(/\.[^/.]+$/, '')}.srt';
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			});
		}

		function setupHighlighting() {
			player = document.getElementById('player');
			const timeEl = document.getElementById('current-time');

			player.addEventListener('timeupdate', () => {
				const t = player.currentTime;
				timeEl.textContent = formatTime(t);

				let active = null;
				for (const seg of segmentsData) {
					if (t >= seg.start && t < seg.end) { active = seg; break; }
				}

				if (active && active.el) {
					if (currentActiveEl && currentActiveEl !== active.el) {
						currentActiveEl.classList.remove('active');
					}
					active.el.classList.add('active');
					currentActiveEl = active.el;
				}
			});

			player.addEventListener('pause', () => {
				if (currentActiveEl) {
					currentActiveEl.classList.remove('active');
					currentActiveEl = null;
				}
			});
		}

		function init() {
			renderTranscript();
			setupSearch();
			setupExportSRT();
			setupHighlighting();

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

			console.log('%c[transcript] Готово. Сегментов: ' + segmentsData.length, 'color:#4ade80');
		}

		init();
	<\/script>
</body>
</html>`;
}
