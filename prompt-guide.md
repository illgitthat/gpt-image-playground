# GPT Image 2.5 prompting notes

An original, condensed summary of [OpenAI's image prompting guide](https://developers.openai.com/api/docs/guides/image-prompting), reviewed September 11, 2026.

## Model and settings

The playground defaults to `gpt-image-2.5-flare`, the smaller, speed-oriented model. Choose `gpt-image-2.5-sunburst` for demanding quality requirements. Both support generation, editing, and transparent backgrounds. Compare representative outputs before assuming either a latency gain or better value.

Set technical parameters through API controls, not prompt prose. The guide documents:

| Setting | GPT Image 2.5 |
| --- | --- |
| Quality | `auto` (API default), `low`, `medium`, `high`, `xhigh`, `max` |
| Size | `auto` or `WIDTHxHEIGHT`; each edge at most 3,840 and divisible by 16, aspect ratio at most 3:1, total pixels 655,360 through 8,294,400 |
| Background | `auto`, `opaque`, `transparent` |
| Transparent output | PNG or WebP; preserve the decoded alpha channel |
| Compression | JPEG or WebP only, not PNG |

Outputs above 3,686,400 pixels are experimental. Examples of valid dimensions include 1024x1024, 1536x1024, 1024x1536, 2048x2048, 2048x1152, and 3840x2160. These are documented model capabilities, not a guarantee that this playground's Responses gateway accepts every setting. Use the choices exposed by the application.

### Playground gateway boundary

Gateway probes reported September 11, 2026 confirmed both 2.5 deployments work when selected through `x-ms-oai-image-generation-deployment`; including either 2.5 ID in `image_generation.model` is rejected. Keep the top-level Responses model as the text orchestrator.

The playground exposes only `auto`, `low`, `medium`, and `high` quality and the sizes `auto`, `1024x1024`, `1536x1024`, and `1024x1536`. Gateway probes rejected `xhigh` and `2048x2048`, despite their documented model support.

The gateway accepts PNG/JPEG but rejects native WebP requests. The playground still supports WebP by requesting lossless PNG and converting it locally with Sharp, preserving alpha; JPEG compression is forwarded to the gateway. Transparent WebP output was verified by decoding the alpha channel for both models at medium quality. Choose PNG or WebP for transparent assets and inspect the actual alpha channel rather than assuming transparency from an accepted request.

The guide describes `n` for variations in Images API examples; it does not establish a Responses-tool batch limit. Concurrent gateway requests can return HTTP 429. Application batch and per-process throttling limits are conservative controls, not a published service quota or a guarantee against throttling; respect upstream retry guidance. The guide's runnable example is still pinned to `gpt-image-2`, so do not copy its model choice into a new workflow.

## Write the smallest complete visual brief

Name the deliverable and subject, then specify important composition, materials, colors, lighting, medium, and constraints. Brief prose works for simple requests; short sections help complex layouts. Camera settings suggest an appearance rather than guaranteeing optical simulation. For realistic people, useful details include framing, gaze, scale, and interaction with objects.

Preserve user specifics rather than embellishing them away. Keep names, counts, dates, colors, placement, and exclusions. Quote literal copy exactly, preserving case, punctuation, line breaks, and requested repetition; describe typography and position without inventing extra text. Distinguish copy to render from instructions. Translation and replacement requests intentionally change the original wording. For charts, lessons, and diagrams, supply the actual data, labels, and relationships. For interfaces, describe a usable layout; for comics, specify one clear visual beat per panel.

Apply only guidance relevant to the task. A short, complete request does not need a longer rewrite. Do not impose studio lighting, camera settings, or a new style on a specific brief. Creative additions belong in "Surprise me" or in requests that invite them, not in factual data or citations. Review generated prompts for omissions, conflicting exclusions, and unrequested changes; checking system-prompt strings alone does not establish output quality.

## Edit and combine references

Number inputs consistently as Image 1, Image 2, and so on. Assign roles such as subject, clothing, style, or destination scene, then describe what moves or is borrowed. Enhancement and surprise requests include all selected references, up to five, in generation order; filenames are not visual descriptions. The prompt endpoints reject invalid or excess references rather than dropping them and changing these indexes; image prompt analysis uses automatic image detail rather than forcing low detail.

Separate the requested change from the preservation requirements. A local edit protects unrelated content but must allow necessary effects, such as contact shadows for an inserted object or changed light for new weather. A new reference-inspired scene borrows the requested features without freezing the original pose, background, or layout. Always retain explicit invariants. Translation should change only the requested wording; do not guess unreadable text. Sketch rendering should retain layout, proportions, and perspective while adding plausible materials and lighting.

For transparent cutouts, request isolation and clean edges without halos, a solid backdrop, or a drawn checkerboard. Do not add a shadow unless requested. Select transparent output in the API as well; prompt wording alone does not configure the file.

## Iterate and verify

Use the previous result as the next reference, change one condition at a time, and repeat critical invariants. Check exact text, factual relationships, identity, geometry, unintended edits, and actual alpha transparency. Prompting cannot guarantee pixel-identical regions; composite an approved local edit into the original when that is required.

For model comparisons, initially hold the prompt, references, dimensions, format, and shared explicit quality setting fixed. Once quality passes, tune one setting at a time and measure typical and slow responses, retries, consistency, and cost per accepted image. On endpoints that support them, use `xhigh` or `max` only when they solve a demonstrated quality gap within the latency budget. Consult the source guide's image-generation pricing link for current costs; speed is not a price guarantee.
