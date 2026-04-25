# GPT Image Generation Models Prompting Guide

Source: https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb

## 1. Introduction

OpenAI's gpt-image generation models are designed for production-quality visuals and highly controllable creative workflows. They are well-suited for both professional design tasks and iterative content creation, and support both high-quality rendering and lower-latency use cases depending on the workflow.

Key Capabilities include:

- **High-fidelity photorealism** with natural lighting, accurate materials, and rich color rendering
- **Flexible quality-latency tradeoffs**, allowing faster generation at lower settings while still exceeding the visual quality of prior-generation image models
- **Robust facial and identity preservation** for edits, character consistency, and multi-step workflows
- **Reliable text rendering** with crisp lettering, consistent layout, and strong contrast inside images
- **Complex structured visuals**, including infographics, diagrams, and multi-panel compositions
- **Precise style control and style transfer** with minimal prompting, supporting everything from branded design systems to fine-art styles
- **Strong real-world knowledge and reasoning**, enabling accurate depictions of objects, environments, and scenarios

This guide highlights prompting patterns, best practices, and example prompts drawn from real production use cases for `gpt-image-2`. It is our most capable image model, with stronger image quality, improved editing performance, and broader support for production workflows. The `low` quality setting is especially strong for latency-sensitive use cases, while `medium` and `high` remain good fits when maximum fidelity matters.

## 1.1 OpenAI Image Model Parameters

This section is a reference for the image models covered in this guide, focused on:

- model name
- supported `outputQuality` values
- supported `input_fidelity` values
- supported `size` / resolution behavior
- recommended use cases by workflow

## Model Summary

As of April 21, 2026, OpenAI has the following image models available.

| Model | `outputQuality` | `input_fidelity` | Resolutions | Recommended use |
| --- | --- | --- | --- | --- |
| `gpt-image-2` | `low`, `medium`, `high` | Disabled. `input_fidelity` does not work for this model because output is already high fidelity by default | Any resolution that satisfies the constraints below | Recommended default for new builds. Use for highest-quality generation and editing, text-heavy images, photorealism, compositing, identity-sensitive edits, and workflows where fewer retries matter more than the lowest possible cost. |
| `gpt-image-1.5` | `low`, `medium`, `high` | `low`, `high` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Keep for existing validated workflows during migration. For new work, prefer `gpt-image-2`, especially when quality, editing reliability, or flexible sizing matter. |
| `gpt-image-1` | `low`, `medium`, `high` | `low`, `high` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Legacy compatibility only. If you are starting a new workflow or refreshing prompts, move to `gpt-image-2`; keep `gpt-image-1` only when you need short-term stability while validating the upgrade. |
| `gpt-image-1-mini` | `low`, `medium`, `high` | `low`, `high` | `1024x1024`, `1024x1536`, `1536x1024`, `auto` | Use when cost and throughput are the main constraint: large batch variant generation, rapid ideation, previews, lightweight personalization, and draft assets that do not require the strongest generation or editing performance. |

### `gpt-image-2` Size Options

`gpt-image-2` supports any resolution passed in the `size` parameter as long as all of these constraints are met:

- Maximum edge length must be less than `3840px`
- Both edges must be a multiple of `16`
- Ratio between the long edge and short edge must not be greater than `3:1`
- Total pixels must not exceed `8,294,400`
- Total pixels must not be less than `655,360`

If the output image exceeds `2560x1440` pixels (`3,686,400` total pixels), commonly referred to as 2K, treat it as experimental because results can be more variable above this size.

### Popular `gpt-image-2` Sizes

These are useful reference points that fit the constraints above:

| Label | Resolution | Notes |
| --- | --- | --- |
| HD portrait | `1024x1536` | Standard portrait option |
| HD landscape | `1536x1024` | Standard landscape option |
| Square | `1024x1024` | Good general-purpose default |
| 2K / QHD | `2560x1440` | Popular widescreen format and recommended upper reliability boundary for `gpt-image-2` |
| 4K / UHD | `3840x2160` | Experimental upper-end target. If the max-edge rule is enforced literally as `< 3840`, round down to the nearest valid size such as `3824x2144` |

### When to Use Which Model

- Choose `gpt-image-2` as the default for most production workflows. It is the strongest overall model and the right upgrade target for teams currently using `gpt-image-1.5` or `gpt-image-1` for high-quality outputs.
- Choose `gpt-image-2` with quality: low when speed and unit economics dominate the decision. This setting has good quality for a lot of use cases and it a strong fit for high-volume generation and experimentation. You can also try `gpt-image-1-mini` for these use cases, but we have seen quality: low works just as well.
- Keep `gpt-image-1.5` or `gpt-image-1` only for backward compatibility while you validate prompt migrations, regression-test outputs, or maintain older workflows that are not yet ready to move.

### Recommended Upgrade Path from `gpt-image-1.5` and `gpt-image-1`

For workflows currently using `gpt-image-1.5` or `gpt-image-1`, the recommendation is:

- Upgrade to `gpt-image-2` for customer-facing assets, photorealistic generation, editing-heavy flows, brand-sensitive creative, text-in-image work, and any workflow where better first-pass quality reduces manual review or reruns.
- Consider `gpt-image-1-mini` instead of legacy models only when the main goal is lowering cost for large batches of exploratory or lower-stakes images.
- During migration, keep prompts largely the same at first, then retune only after you have compared output quality, latency, and retry rates on your real workload.

## 2. Prompting Fundamentals

The following prompting fundamentals are applicable to GPT image generation models. They are based on patterns that showed up repeatedly in alpha testing across generation, edits, infographics, ads, human images, UI mockups, and compositing workflows.

- **Structure + goal:** Write prompts in a consistent order (background/scene -> subject -> key details -> constraints) and include the intended use (ad, UI mock, infographic) to set the "mode" and level of polish. For complex requests, use short labeled segments or line breaks instead of one long paragraph.

- **Prompt format:** Use the format that is easiest to maintain. Minimal prompts, descriptive paragraphs, JSON-like structures, instruction-style prompts, and tag-based prompts can all work well as long as the intent and constraints are clear. For production systems, prioritize a skimmable template over clever prompt syntax.

- **Specificity + quality cues:** Be concrete about materials, shapes, textures, and the visual medium (photo, watercolor, 3D render), and add targeted "quality levers" only when needed (e.g., *film grain*, *textured brushstrokes*, *macro detail*). For photorealism, include the word "photorealistic" directly in the prompt to strongly engage the model's photorealistic mode. Similar phrases like "real photograph," "taken on a real camera," "professional photography," or "iPhone photo" can also help, but detailed camera specs may be interpreted loosely, so use them mainly for high-level look and composition rather than exact physical simulation.

- **Latency vs fidelity:** For latency-sensitive or high-volume use cases, start with `quality="low"` and evaluate whether it meets your visual requirements. In many cases, it provides sufficient fidelity with significantly faster generation. For small or dense text, detailed infographics, close-up portraits, identity-sensitive edits, and high-resolution outputs, compare `medium` or `high` before shipping.

- **Composition:** Specify framing and viewpoint (close-up, wide, top-down), perspective/angle (eye-level, low-angle), and lighting/mood (soft diffuse, golden hour, high-contrast) to control the shot. If layout matters, call out placement (e.g., "logo top-right," "subject centered with negative space on left"). For wide, cinematic, low-light, rain, or neon scenes, add extra detail about scale, atmosphere, and color so the model does not trade mood for surface realism.

- **People, pose, and action:** For people in scenes, describe scale, body framing, gaze, and object interactions. Examples: "full body visible, feet included," "child-sized relative to the table," "looking down at the open book, not at the camera," or "hands naturally gripping the handlebars." These details help with body proportion, action geometry, and gaze alignment.

- **Constraints (what to change vs preserve):** State exclusions and invariants explicitly (e.g., "no watermark," "no extra text," "no logos/trademarks," "preserve identity/geometry/layout/brand elements"). For edits, use "change only X" + "keep everything else the same," and repeat the preserve list on each iteration to reduce drift. If the edit should be surgical, also say not to alter saturation, contrast, layout, arrows, labels, camera angle, or surrounding objects.

- **Text in images:** Put literal text in **quotes** or **ALL CAPS** and specify typography details (font style, size, color, placement) as constraints. For tricky words (brand names, uncommon spellings), spell them out letter-by-letter to improve character accuracy. Use `medium` or `high` quality for small text, dense information panels, and multi-font layouts.

- **Multi-image inputs:** Reference each input by **index and description** ("Image 1: product photo... Image 2: style reference...") and describe how they interact ("apply Image 2's style to Image 1"). When compositing, be explicit about which elements move where ("put the bird from Image 1 on the elephant in Image 2").

- **Iterate instead of overloading:** Long prompts can work well, but debugging is easier when you start with a clean base prompt and refine with small, single-change follow-ups ("make lighting warmer," "remove the extra tree," "restore the original background"). Use references like "same style as before" or "the subject" to leverage context, but re-specify critical details if they start to drift.

## 3. Setup

Run this once. It:

- creates the API client
- creates `output_images/` in the images folder.
- adds a small helper to save base64 images

Put any reference images used for edits into `input_images/` (or update the paths in the examples).

The examples below uses our most capable image model `gpt-image-2`.

## 4. Use Cases: Generate (Text to Image)

## 4.1 Infographics

Use infographics to explain structured information for a specific audience: students, executives, customers, or the general public. Examples include explainers, posters, labeled diagrams, timelines, and "visual wiki" assets. For dense layouts or heavy in-image text, it's recommedned to set output generation quality to "high".

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/infographic_coffee_machine_gpt-image-2.png)

## 4.2 Translation in Images

Used for localizing existing designs (ads, UI screenshots, packaging, infographics) into another language without rebuilding the layout from scratch. The key is to preserve everything except the text: keep typography style, placement, spacing, and hierarchy consistent, while translating verbatim and accurately, with no extra words, no reflow unless necessary, and no unintended edits to logos, icons, or imagery.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/infographic_coffee_machine_sp_gpt-image-2.png)

## 4.3 Photorealistic Images that Feel "Natural"

To get believable photorealism, prompt the model as if a real photo is being captured in the moment. Use photography language (lens, lighting, framing) and explicitly ask for real texture (pores, wrinkles, fabric wear, imperfections). Avoid words that imply studio polish or staging. When detail matters, set quality="high".

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/photorealism-gpt-image-2.png)

## 4.4 World Knowledge

GPT image generation models can pair strong reasoning with world knowledge. For example, when asked to generate a scene set in Bethel, New York in August 1969, they can infer Woodstock and produce an accurate, context-appropriate image without being explicitly told about the event.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/world_knowledge-gpt-image-2.png)

## 4.5 Logo Generation

Strong logo generation comes from clear brand constraints and simplicity. Describe the brand's personality and use case, then ask for a clean, original mark with strong shape, balanced negative space, and scalability across sizes.

You can specify parameter "n" to denote the number of variations you would like to generate.

Output Images:

| Option 1 | Option 2 | Option 3 | Option 4 |
|:--------:|:--------:|:--------:|:--------:|
| ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/logo_generation_1_gpt-image-2.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/logo_generation_2_gpt-image-2.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/logo_generation_3_gpt-image-2.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/logo_generation_4_gpt-image-2.png)|

## 4.6 Ads Generation

Ad generation works best when the prompt is written like a creative brief rather than a purely technical image spec. Describe the brand, audience, culture, concept, composition, and exact copy, then let the model make taste-driven creative decisions inside those boundaries. This is useful for early campaign exploration because the model can interpret audience cues, infer art direction, and propose visual details that make the ad feel considered rather than merely rendered.

For stronger results, include the brand positioning, desired vibe, target audience, scene, and tagline in the same prompt. If the text must appear in the image, quote it exactly and ask for clean, legible typography.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/thread_ad_gpt-image-2.png)

## 4.7 Story-to-Comic Strip

For story-to-comic generation, define the narrative as a sequence of clear visual beats, one per panel. Keep descriptions concrete and action-focused so the model can translate the story into readable, well-paced panels.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/comic_reel-gpt-image-2.png)

## 4.8 UI Mockups

UI mockups work best when you describe the product as if it already exists. Focus on layout, hierarchy, spacing, and real interface elements, and avoid concept art language so the result looks like a usable, shipped interface rather than a design sketch.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/ui_farmers_market_gpt-image-2.png)

## 4.9 Scientific / Educational Visuals

Scientific and educational visuals are strong fits for biology, chemistry, classroom explainers, flat scientific icon systems, diagrams, and learning assets. Prompt them like an instructional design brief: define the audience, lesson objective, visual format, required labels, and scientific constraints. For best results, ask for a clean, flat visual system with consistent icon style, clear arrows, readable labels, and enough white space for students to scan the concept quickly.

When accuracy matters, list the required components explicitly and say what should not be included. Use `quality="high"` for dense labels, diagrams, or assets that will be used in slides or course materials.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/scientific_educational_cellular_respiration_gpt-image-2.png)

## 4.10 Slides, Diagrams, Charts, and Productivity Images

Productivity visuals work best when the prompt is written like an artifact spec rather than an illustration request. Name the exact deliverable (slide, workflow diagram, chart, page image), define the canvas and hierarchy, provide the real text or data, and describe the visual language. These prompts should include practical constraints: readable typography, polished spacing, no decorative clutter, and no generic stock-photo treatment.

For slides, charts, and diagram-heavy assets, include the numbers and labels directly in the prompt. Use a landscape size for deck-style outputs and `quality="high"` when the image contains small text, legends, axes, or footnotes.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/market_opportunity_slide_gpt-image-2.png)

## 5. Use Cases: Edit (Text + Image to Image)

## 5.1 Style Transfer

Style transfer is useful when you want to keep the *visual language* of a reference image (palette, texture, brushwork, film grain, etc.) while changing the subject or scene. For best results, describe what must stay consistent (style cues) and what must change (new content), and add hard constraints like background, framing, and "no extra elements" to prevent drift.

Input Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/pixels.png)

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/motorcycle_gpt-image-2.png)

## 5.2 Virtual Clothing Try-On

Virtual try-on is ideal for ecommerce previews where identity preservation is critical. The key is to explicitly lock the person (face, body shape, pose, hair, expression) and allow changes *only* to garments, then require realistic fit (draping, folds, occlusion) plus consistent lighting/shadows so the outfit looks naturally worn, not pasted on.

Input Images:

| Full Body | Item 1 |
|:------------:|:--------------:|
| ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/woman_in_museum.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/jacket.png) |
| Item 2 | Item 3 |
| ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/tank_top.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/boots.png) |

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/outfit_gpt-image-2.png)

## 5.3 Drawing to Image (Rendering)

Sketch-to-render workflows are great for turning rough drawings into photorealistic concepts while keeping the original intent. Treat the prompt like a spec: preserve layout and perspective, then *add realism* by specifying plausible materials, lighting, and environment. Include "do not add new elements/text" to avoid creative reinterpretations.

Input Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/drawings.png)

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/realistic_valley_gpt-image-2.png)

## 5.4 Product Mockups (Clean Background + Label Integrity)

Product extraction and mockup prep is commonly used for catalogs, marketplaces, and design systems. Success depends on edge quality (clean silhouette, no fringing/halos) and label integrity (text stays sharp and unchanged). For `gpt-image-2`, keep the output background opaque and use a downstream background-removal step if you need a final transparent asset. If you want realism without re-styling, ask for only light polishing and optionally a subtle contact shadow on a plain background.

Input Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/shampoo.png)

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/extract_product_gpt-image-2.png)

## 5.5 Marketing Creatives with Real Text In-Image

Marketing creatives with real in-image text are great for rapid ad concepting, but typography needs explicit constraints. Put the exact copy in quotes, demand verbatim rendering (no extra characters), and describe placement and font style. If text fidelity is imperfect, keep the prompt strict and iterate. Small wording/layout tweaks usually improve legibility.

Input Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/shampoo.png)

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/billboard_gpt-image-2.png)

## 5.6 Lighting and Weather Transformation

Used to re-stage a photo for different moods, seasons, or time-of-day variants (e.g., sunny to overcast, daytime to dusk, clear to snowy) while keeping the scene composition intact. The key is to change only environmental conditions: lighting direction/quality, shadows, atmosphere, precipitation, and ground wetness, while preserving identity, geometry, camera angle, and object placement so it still reads as the same original photo.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/billboard_winter_gpt-image-2.png)

## 5.7 Object Removal

Person-in-scene compositing is useful for storyboards, campaigns, and "what if" scenarios where facial/identity preservation matters. Anchor realism by specifying a grounded photographic look (natural lighting, believable detail, no cinematic grading), and lock what must not change about the subject. When available, higher input fidelity helps maintain likeness during larger scene edits.

Input and output images:

| Original Input | Output Image |
|:------------:|:--------------:|
| ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/man_with_blue_hat.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/man_with_no_flower_gpt-image-2.png) |

## 5.8 Insert the Person Into a Scene

Person-in-scene compositing is useful for storyboards, campaigns, and "what if" scenarios where facial/identity preservation matters. Anchor realism by specifying a grounded photographic look (natural lighting, believable detail, no cinematic grading), and lock what must not change about the subject. When available, higher input fidelity helps maintain likeness during larger scene edits.

Output Image:

## 5.9 Multi-Image Referencing and Compositing

Used to combine elements from multiple inputs into a single, believable image. This is useful for "insert this object/person into that scene" workflows without re-generating everything. The key is to clearly specify what to transplant (the dog from image 2), where it should go (right next to the woman in image 1), and what must remain unchanged (scene, background, framing), while matching lighting, perspective, scale, and shadows so the composite looks naturally captured in the original photo.

Input and output images:

| Original Input | Remove Red Stripes | Change Hat Color |
|:--------------:|:------------------:|:----------------:|
| ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/test_woman.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/test_woman_2.png) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/test_woman_with_dog_gpt-image-2.png) |

## 6. Additional High-Value Use Cases

## 6.1 Interior Design "Swap" (Precision Edits)

Used for visualizing furniture or decor changes in real spaces without re-rendering the entire scene. The goal is surgical realism: swap a single object while preserving camera angle, lighting, shadows, and surrounding context so the edit looks like a real photograph, not a redesign.

Input and output images:

| Input Image | Output Image |
|------------|--------------|
| ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/kitchen.jpeg) | ![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/kitchen-chairs_gpt-image-2.png) |

## 6.2 3D Pop-Up Holiday Card (Product-Style Mock)

Ideal for seasonal marketing concepts and print previews. Emphasizes tactile realism: paper layers, fibers, folds, and soft studio lighting, so the result reads as a photographed physical product rather than a flat illustration.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/christmas_holiday_card_teddy_gpt-image-2.png)

## 6.3 Collectible Action Figure / Plush Keychain (Merch Concept)

Used for early merch ideation and pitch visuals. Focuses on premium product photography cues (materials, packaging, print clarity) while keeping designs original and non-infringing. Works well for testing multiple character or packaging variants quickly.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/christmas_collectible_toy_airplane_gpt-image-2.png)

## 6.4 Children's Book Art with Character Consistency (Multi-Image Workflow)

Designed for multi-page illustration pipelines where character drift is unacceptable. A reusable "character anchor" ensures visual continuity across scenes, poses, and pages while allowing environmental and narrative variation.

### Character Anchor: Establish the Reusable Main Character

Goal: Lock the character's appearance, proportions, outfit, and tone.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/childrens_book_illustration_1_gpt-image-2.png)

### Story Continuation: Reuse Character, Advance the Narrative

Goal: Same character, new scene + action. Character appearance must remain unchanged.

Output Image:

![](https://raw.githubusercontent.com/openai/openai-cookbook/main/images/childrens_book_illustration_2_gpt-image-2.png)

## Conclusion

In this notebook, we demonstrate how to use gpt-image generation models to build high-quality, controllable image generation and editing workflows that hold up in real production settings. The cookbook emphasizes prompt structure, explicit constraints, and small iterative changes as the primary tools for controlling realism, layout, text accuracy, and identity preservation. We cover both generation and editing patterns, ranging from infographics, photorealism, UI mockups, and logos to translation, style transfer, virtual try-on, compositing, and lighting changes. Throughout the examples, the cookbook reinforces the importance of clearly separating what should change from what must remain invariant, and of restating those invariants on every iteration to prevent drift. We also highlight how quality and input-fidelity settings enable deliberate tradeoffs between latency and visual precision depending on the use case. Together, these examples form a practical, repeatable playbook for applying gpt-image generation models in production image workflows.
