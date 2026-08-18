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

Drop files into `input/` (or another folder), run the tool, and open the matching `.html` next to each recording. On start, the CLI prints the ASCII banner and the resolved option values.

## Features

- Batch processing of audio in a folder (optional recursion into subfolders)
- Converts media to 16 kHz mono WAV via ffmpeg when needed
- Runs whisper.cpp and builds HTML from its JSON output
- Optional **VAD** (Voice Activity Detection) via Silero (`--usevad`)
- Interactive transcript: click a line or timestamp to seek the player
- Live highlight of the current segment while audio plays
- In-page search and **Download SRT**
- Keyboard shortcuts in the HTML viewer: `Space` play/pause, `F` focus search
- Skips files that already have JSON (unless `--force`); cleans up intermediates unless `--keep`

## Requirements

| Dependency | Purpose |
|---|---|
| **Node.js** ≥ 18 | Runs `start.mjs` |
| **ffmpeg** | Converts input audio/video to WAV (`ffmpeg` on `PATH`) |
| **whisper.cpp** | Binary such as `whisper-cli` / `main`, plus a `ggml-*.bin` model |
| **Silero VAD model** (optional) | Only if you use `--usevad` (`ggml-silero-v6.2.0.bin` under the whisper models dir) |

No npm runtime dependencies beyond Node itself (`"type": "module"` CLI).

## Quick start

1. Install [ffmpeg](https://ffmpeg.org/) and build or download [whisper.cpp](https://github.com/ggerganov/whisper.cpp) with a model (e.g. `ggml-large-v3.bin`).
2. Clone this repo and put audio under `input/`:

   ```bash
   git clone https://github.com/mankey-ru/whisper-generator.git
   cd whisper-generator
   ```

3. Point the tool at your whisper binary and model (defaults are Windows paths under `P:\!Whisper.cpp` — override them):

   ```powershell
   $env:WHISPER_EXE = "C:\whisper.cpp\whisper-cli.exe"
   $env:WHISPER_MODEL = "C:\whisper.cpp\models\ggml-large-v3.bin"
   npm start -- --input ./input --lang ru -r
   ```

4. Open the generated `.html` files next to each source (the HTML references the original audio by filename, so keep them in the same folder).

## Usage

```bash
npm start -- [options]
npm run startkeep          # same as: node . -- --keep
node start.mjs [options]
# after npm link / install of the bin:
whisper-html [options]
```

### Options

| Option | Short | Default | Description |
|---|---|---|---|
| `--help` | `-h` | — | Show help and exit |
| `--input <path>` | | `input` | Input directory (relative paths are resolved from the script directory) |
| `--recurse` | `-r` | `false` | Process nested folders |
| `--force` | `-f` | `false` | Re-run whisper even if JSON already exists |
| `--keep` | `-k` | `false` | Keep intermediate `.wav` and `.json` files |
| `--usevad` | | `false` | Enable whisper.cpp VAD (Silero model + duration thresholds) |
| `--lang <code>` | `-l` | `ru` (or `LANGUAGE`) | Recognition language (`ru`, `en`, `auto`, …) |
| `--threads <n>` | | `12` (or `THREADS`) | whisper.cpp thread count |
| `--whisper <path>` | | `WHISPER_EXE` or `P:\!Whisper.cpp\whisper-cli.exe` | Path to whisper binary |
| `--model <path>` | | `WHISPER_MODEL` or `P:\!Whisper.cpp\models\ggml-large-v3.bin` | Path to ggml model |

Examples:

```bash
# Help
npm start -- --help

# Recursive batch, English, keep intermediates
npm start -- --input ./input --lang en -r -k

# Debug-friendly: VAD + keep intermediates
npm start -- --input ./tmp --usevad --keep

# Force re-transcribe with a custom model
npm start -- -f --model /path/to/ggml-medium.bin --whisper /path/to/whisper-cli
```

### Environment variables

| Variable | Maps to |
|---|---|
| `WHISPER_EXE` | `--whisper` |
| `WHISPER_MODEL` | `--model` |
| `LANGUAGE` | `--lang` |
| `THREADS` | `--threads` |

## Supported input formats

`.mp3`, `.m4a`, `.ogg`, `.flac`, `.aac`, `.mp4`

WAV is not listed as a primary input extension; the pipeline produces 16 kHz mono WAV for whisper.

## Pipeline

For each audio file `name.ext` in the input tree:

1. **Convert** → `name.wav` (16 kHz, mono, PCM) if missing — via ffmpeg  
2. **Transcribe** → whisper.cpp with `--output-json` (and VAD flags if `--usevad`)  
3. **Normalize** JSON filename to `name.json`  
4. **Generate** → `name.html` (standalone page: player + transcript)  
5. **Cleanup** — delete `.wav` and `.json` unless `--keep`

Existing JSON is reused unless `--force` is set; HTML is regenerated from that JSON.

With `--usevad`, whisper is invoked with `--vad`, `--vad-model` pointing at `ggml-silero-v6.2.0.bin` under the default whisper directory, plus min silence/speech duration settings.

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
├── start.mjs              # CLI entry (bin: whisper-html); banner + batch runner
├── lib/
│   ├── cli-options.mjs    # Named flags & help
│   ├── segment-parser.mjs # whisper JSON → segments
│   ├── html-generator.mjs # Interactive HTML
│   └── timestamp-utils.mjs
├── input/                 # Default drop folder for media
├── run.ps1                # Older PowerShell batch (txt-oriented; prefer npm start)
└── package.json
```

## License

MIT — `author`: [mankey-ru](https://github.com/mankey-ru).
