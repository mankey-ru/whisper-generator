# Whisper Generator

```
 _       ____    _                      ______         
| |     / / /_  (_)________  ___  _____/ ____/__  ____ 
| | /| / / __ \/ / ___/ __ \/ _ \/ ___/ / __/ _ \/ __ \
| |/ |/ / / / / (__  ) /_/ /  __/ /  / /_/ /  __/ / / /
|__/|__/_/ /_/_/____/ .___/\___/_/   \____/\___/_/ /_/ 
                   /_/                                 
```

Batch-transcribe audio with [whisper.cpp](https://github.com/ggerganov/whisper.cpp) and **ffmpeg**, then generate self-contained HTML pages with a player and **clickable timecodes**.

Drop files into `input/` (or another folder), run the tool, and each recording ends up in its own `_OUT [date] name [model]` folder together with its `.html` and `.json`. On start, the CLI prints the ASCII banner and the resolved option values.

## Features

- Batch processing of audio in a folder (optional recursion into subfolders) or a single file
- Converts media to 16 kHz mono WAV via ffmpeg when needed
- Runs whisper.cpp and builds HTML from its JSON output
- Models are picked by key from `config.js`; `npm run get` downloads/quantizes them
- **VAD** (Voice Activity Detection) via Silero, on by default when `config.js` has an `isVAD` model
- Interactive transcript: click a line or timestamp to seek the player
- Live highlight of the current segment while audio plays
- In-page search and **Download SRT**
- Keyboard shortcuts in the HTML viewer: `Space` play/pause, `F` focus search
- Each processed file is packed into its own `_OUT …` folder; `--debug` leaves everything next to the source instead
- Skips transcription when JSON already exists (unless `--force`)

## Requirements

| Dependency | Purpose |
|---|---|
| **Node.js** ≥ 18 | Runs `start.js` |
| **ffmpeg** | Converts input audio/video to WAV (`ffmpeg` on `PATH`) |
| **whisper.cpp** | `whisper-cli` binary; `quantize` binary only for quantized models built locally |
| **Models** | `ggml-*.bin` whisper models and the Silero VAD model, listed in `config.js` |

No npm runtime dependencies beyond Node itself (`"type": "module"` CLI).

## Quick start

1. Install [ffmpeg](https://ffmpeg.org/) and build or download [whisper.cpp](https://github.com/ggerganov/whisper.cpp).
2. Clone this repo:

   ```bash
   git clone https://github.com/mankey-ru/whisper-generator.git
   cd whisper-generator
   ```

3. Set `whisperDir` in `config.js` to your whisper.cpp folder and fetch the models:

   ```bash
   npm run get
   ```

4. Put audio under `input/` and run:

   ```bash
   npm start
   ```

5. Open the `.html` inside each `_OUT …` folder (the HTML references the original audio by filename, which is packed into the same folder).

## Configuration: `config.js`

```js
export default {
	whisperDir: 'P:\\!Whisper.cpp',
	models: [
		{ key: 'LV3', isDefault: true, name: 'ggml-large-v3.bin', sourceType: 'URL', sourceParams: { url: '…' } },
		{ key: 'LV3-Q8', skip: true, name: 'ggml-large-v3-q8_0.bin', sourceType: 'QUANTIZE', sourceParams: { keyFrom: 'LV3', cliOpts: ['q8_0'] } },
		{ key: 'SILERO-V6', isVAD: true, name: 'ggml-silero-v6.2.0.bin', sourceType: 'URL', sourceParams: { url: '…' } },
	],
};
```

Paths derived from `whisperDir`:

| Path | Used for |
|---|---|
| `<whisperDir>\whisper-cli.exe` | default `--whisper` |
| `<whisperDir>\models\<name>` | model files |
| `<whisperDir>\build\bin\quantize.exe` | `QUANTIZE` models in `npm run get` |

Model fields:

| Field | Meaning |
|---|---|
| `key` | Model id, used by `--modelKey` and `keyFrom` |
| `name` | File name under `<whisperDir>\models` |
| `sourceType` | `URL` — download `sourceParams.url`; `QUANTIZE` — build from `sourceParams.keyFrom` with `quantize` and `sourceParams.cliOpts` |
| `isDefault` | Whisper model used when `--modelKey` is not given |
| `isVAD` | VAD model: not selectable via `--modelKey`; the first one is the default `--vadModel` |
| `skip` | `npm run get` does not download/build it |

`npm run get` fetches every non-skipped model that is missing from the models folder.

The config shape is typed as `AppConfig` in `types.d.ts`: the editor (or `npm run typecheck`) flags unknown fields, a wrong `sourceType` or `sourceParams` that do not match it.

## Usage

```bash
npm start -- [options]
npm run start-debug        # same as: npm start -- --debug
npm run start-tmp          # same as: npm start -- --debug --input ./tmp
npm run get                # download / quantize models from config.js
npm run typecheck          # tsc over JSDoc types (no emit)
node start.js [options]
# after npm link / install of the bin:
whisper-html [options]
```

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--help` | `-h` | — | Show help and exit |
| `--input <path>` | | `input` | Input folder or single file (relative paths are resolved from the script directory) |
| `--recurse` | `-r` | `false` | Process nested folders (`_OUT …` folders are skipped) |
| `--force` | `-f` | `false` | Re-run whisper even if JSON already exists |
| `--debug` | `-d` | `false` | Don't pack into `_OUT …`; keep all files, including the intermediate `.wav`, next to the source |
| `--modelKey <key>` | | model with `isDefault` | Whisper model key from `config.js` |
| `--vadModel <path>` | | first `isVAD` model | Silero VAD model; VAD is off if there is none |
| `--lang <code>` | `-l` | `ru` | Recognition language (`ru`, `en`, `auto`, …) |
| `--threads <n>` | | `12` | whisper.cpp thread count |
| `--colors` | | `false` | Colour tokens by confidence (`--output-json-full` + `--print-colors`) |
| `--whisper <path>` | | `<whisperDir>\whisper-cli.exe` | Path to whisper binary |

Examples:

```bash
# Help
npm start -- --help

# Recursive batch, English, turbo model
npm start -- --input ./input --lang en -r --modelKey LV3T-Q5

# Force re-transcribe one file, keep everything next to it
npm start -- -f -d --input ./input/meeting.mp3
```

## Supported input formats

`.mp3`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.mp4`

WAV is not listed as a primary input extension; the pipeline produces 16 kHz mono WAV for whisper.

## Pipeline

For each source file `name.ext`, working files are created next to it (the source extension is kept in their names, so `a.mp3` and `a.mp4` don't collide):

1. **Convert** → `name.ext.wav` (16 kHz, mono, PCM) if missing — via ffmpeg
2. **Transcribe** → `name.ext.json` via whisper.cpp — skipped if the JSON already exists, unless `--force`
3. **Generate** → `name.ext.html` (standalone page: player + transcript)
4. **Pack** (skipped with `--debug`) — create `_OUT [YYYY-MM-DD HH-mm] name.ext [modelKey]` next to the source, move the source, JSON and HTML into it, delete the `.wav`

Pack details:

- The timestamp is local time, one per run, so files from one run share it.
- If the folder already exists, ` (2)`, ` (3)`, … is appended.
- The source is moved first. If it is locked (e.g. open in a player), the folder is removed and everything stays next to the source; the next run packs it from the cached JSON without re-transcribing.
- The list of created folders is printed at the end.

Since the JSON is a cache, a `--debug` run followed by a plain run only packs the result. Note that the cached JSON may come from a different model than the `[modelKey]` in the folder name — use `--force` to re-transcribe.

## Output HTML

Each page is self-contained (Tailwind via CDN) and includes:

- HTML5 audio player pointing at the original filename  
- Timestamped segments; click to seek  
- Active-segment highlighting during playback  
- Text search filter  
- Export to `.srt`

Open the HTML from the same directory as the audio so the relative `src` resolves.

## Project layout

```
whisper-generator/
├── start.js               # CLI entry (bin: whisper-html); banner + batch runner + packing
├── config.js              # whisperDir and model list
├── lib/
│   ├── cli-options.js     # Named flags & help
│   ├── get-models.js      # npm run get: download / quantize models
│   ├── segment-parser.js  # whisper JSON → segments
│   ├── html-generator.js  # Interactive HTML
│   └── timestamp-utils.js
├── types.d.ts             # Shared JSDoc types
├── input/                 # Default drop folder for media
└── package.json
```

## License

MIT — `author`: [mankey-ru](https://github.com/mankey-ru).
