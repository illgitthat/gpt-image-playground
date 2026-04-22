# Gpt-image-2 Prompting Guide

## 1. Introduction

`gpt-image-2` is a production-grade image generation model designed for high-quality visuals, strong instruction following, and multilingual creative workflows. It improves realism, contextual understanding, and rendering flexibility over previous generations.

### Key Capabilities

- **High-fidelity photorealism:** Natural lighting, accurate materials, and rich color rendering.
- **Flexible quality–latency tradeoffs:** Generate faster at lower settings while maintaining high visual quality.
- **Facial and identity preservation:** Robust consistency for edits and multi-step workflows.
- **Reliable text rendering:** Crisp lettering, consistent layout, and strong contrast.
- **Complex structured visuals:** Support for infographics, diagrams, and multi-panel compositions.
- **Precise style control:** Minimal prompting required for brand systems or fine-art styles.
- **Real-world reasoning:** Accurate depictions of historical eras, specific objects, and environments.

---

## 2. Prompting Fundamentals

- **Structure + Goal:** Write prompts in a consistent order: **Background/Scene → Subject → Key Details → Constraints**. Include the intended use (e.g., "ad," "UI mockup," "infographic") to set the polish level. Use short labeled segments or line breaks for complex requests.
- **Specificity + Quality Cues:** Be concrete about materials, textures, and medium (photo, watercolor, 3D render). Use camera/composition terms (e.g., _50mm lens_, _shallow depth of field_, _golden hour_) rather than generic terms like "8K."
- **Latency vs. Fidelity:** For high-volume use cases, test with `quality="low"`. It often provides sufficient fidelity with significantly faster generation.
- **Composition:** Specify framing (close-up, wide, top-down), perspective (eye-level, low-angle), and lighting. Explicitly define placement (e.g., "subject centered with negative space on left").
- **Constraints:** State exclusions clearly (e.g., "no watermark," "no extra text"). For edits, use the pattern: **"Change only X" + "Keep everything else the same."**
- **Text in Images:** Put literal text in **"QUOTES"** or **ALL CAPS**. Specify typography details (font style, size, color). For uncommon words, spell them out letter-by-letter in the prompt.
- **Multi-image Inputs:** Reference inputs by index (e.g., "Image 1: product... Image 2: style reference"). Explicitly describe the interaction (e.g., "Apply Image 2's style to Image 1").
- **Iterate Instead of Overloading:** Start with a clean base prompt. Refine with single-change follow-ups ("make lighting warmer") rather than writing a massive paragraph initially.

---

## 3. Use Cases & Prompt Examples

### 3.1 Infographics & Structured Data

Use for explainers, diagrams, or timelines. Set `quality="high"` for dense layouts.

> **Example:** "Create a detailed Infographic of the functioning and flow of an automatic coffee machine. From bean basket, to grinding, to scale, water tank, boiler, etc. technically and visually explain the flow."

### 3.2 Translation & Localization

Preserve layout and typography while replacing text verbatim.

> **Example:** "Translate the text in the infographic to Spanish. Do not change any other aspect of the image. Keep typography style, placement, and hierarchy consistent."

### 3.3 Photorealism (The "Natural" Look)

Prompt like a real photo being captured. Ask for imperfections (pores, wrinkles, fabric wear).

> **Example:** "Photorealistic candid photograph of an elderly sailor... weathered skin with visible wrinkles, pores... 35mm film photograph, medium close-up, 50mm lens. Soft coastal daylight, subtle film grain. No glamorization."

### 3.4 Logo Generation

Focus on simplicity, negative space, and scalability.

> **Example:** "Original, non-infringing logo for 'Field & Flour' bakery. Warm, simple, timeless. Clean vector-like shapes, strong silhouette, flat design. Plain background, single centered logo."

### 3.5 UI Mockups

Describe the product as if it exists. Focus on layout, hierarchy, and real interface elements.

> **Example:** "Realistic mobile app UI mockup for a farmers market. Header, list of vendors with photos, 'Today's specials' section. Practical, clean typography, white background. Place in an iPhone frame."

### 3.6 Style Transfer (Edit)

Keep the visual language of a reference while changing the subject.

> **Example:** "Use the same style from the input image [Image 1] and generate a man riding a motorcycle on a white background."

### 3.7 Virtual Clothing Try-On

Lock the person's identity and change only the garments.

> **Example:** "Dress the woman using the provided clothing images. Do not change her face, skin tone, body shape, or identity. Replace only the clothing, fitting garments naturally with realistic fabric behavior and matching lighting."

### 3.8 Product Extraction & Mockups

Use for catalog prep or billboards.

> **Example:** "Extract the product from the input image. Output: transparent background (RGBA PNG), crisp silhouette. Preserve product geometry and label legibility exactly. Lightly polish, no restyling."

### 3.9 Lighting & Weather Transformation

Change environmental conditions while preserving scene geometry.

> **Example:** "Make it look like a winter evening with snowfall. Preserve camera angle, identity, and object placement. Change only lighting quality and atmosphere."

### 3.10 Character Consistency (Children's Books)

Establish a "Character Anchor" and reference it in subsequent prompts.

> **Example (Anchor):** "Children's book illustration of a young hero in a green hooded tunic, brown boots. Hand-painted watercolor look, whimsical and friendly."
> **Example (Sequence):** "Continue the story using the same character from [Image 1]. Same tunic, same facial features. The hero is now helping a squirrel in a snowy forest."

---

## 4. Summary Checklist for Success

1.  **Define the Mode:** Is it a photo, a vector logo, or a UI mockup?
2.  **Lock Invariants:** What _must not_ change? (Identity, background, text).
3.  **Use Constraints:** "No watermarks," "No extra elements."
4.  **Reference Indexes:** If using multiple images, label them (Image 1, Image 2).
5.  **Quality Toggle:** Use `quality="high"` for text/detail-heavy tasks; `low` for speed.
