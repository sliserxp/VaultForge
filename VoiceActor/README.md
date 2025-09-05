# Obsidian Voice Actor (starter)
Speak selected text and batch-render NPC dialogue to audio using **Piper** (local TTS) or the browser's **Web Speech** (live playback only).

## Quick Start
1. Copy this folder into your vault's `.obsidian/plugins/voice-actor/` directory.
2. In this folder, run:
   ```bash
   npm i
   npm run build
   ```
3. In Obsidian → Settings → Community plugins, enable **Voice Actor**.
4. Open plugin settings:
   - Provider: **Piper** (recommended on Linux) or **Web Speech** (live playback only).
   - If Piper: set the **Piper Binary Path** and **Voice Model Path** (e.g., `/usr/bin/piper` and `/home/you/models/en_US-amy-medium.onnx`).
   - Output folder (in vault): default `Audio`.
5. Use commands:
   - **Voice Actor: Speak Selection Now** (works with any provider; fileless for Web Speech).
   - **Voice Actor: Render Selection to Audio File** (requires Piper).
   - **Voice Actor: Batch Render Dialogues in Note** (requires Piper).

## Dialogue format (batch)
Any of these per-line formats are detected:
- `Eveline: Bring the refugees inside the walls.`
- `**Guild Master**: We ride at dawn.`

The plugin will map `speaker -> voice model` using the **Voice Map** in settings. You can also define a per-note map in YAML frontmatter:
```yaml
---
voices:
  Eveline: /path/to/voice.onnx
  "Guild Master": /path/to/other.onnx
---
```

## Notes
- Piper CLI example the plugin uses:
  ```bash
  piper --model <voice.onnx> --output_file <file.wav> --text "Hello world" --length_scale 1.0 --noise_scale 0.667 --noise_w 0.333
  ```
- Web Speech can **only speak**; it cannot save audio to a file.
- Desktop-only due to the Piper CLI.
