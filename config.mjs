export default {
	whisperDir: 'P:\\!Whisper.cpp',
	models: [
		{
			key: 'LV3',
			isDefault: true,
			name: 'ggml-large-v3.bin',
			sourceType: 'URL',
			sourceParams: {
				url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin',
			},
		},
		{
			key: 'LV3-Q8',
			skip: true,
			name: 'ggml-large-v3-q8_0.bin',
			sourceType: 'QUANTIZE',
			sourceParams: {
				keyFrom: 'LV3',
				cliOpts: ['q8_0'],
			},
		},
		{
			key: 'LV3T',
			skip: true,
			name: 'ggml-large-v3-turbo.bin',
			sourceType: 'URL',
			sourceParams: {
				url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin',
			},
		},
		{
			key: 'LV3T-Q5',
			name: 'ggml-large-v3-turbo-q5_0.bin',
			sourceType: 'URL',
			sourceParams: {
				url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
			},
		},
		{
			key: 'SILERO-V6',
			isVAD: true,
			name: 'ggml-silero-v6.2.0.bin',
			sourceType: 'URL',
			sourceParams: {
				url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/main/ggml-silero-v6.2.0.bin',
			},
		},
	],
};
