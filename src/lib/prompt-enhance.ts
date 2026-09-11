import type OpenAI from 'openai';

const imagePromptRules = `- Return only the ready-to-use image prompt. Return an already complete, clear request unchanged. Otherwise use natural prose for simple requests and short labeled sections for complex layouts; no commentary, filler, or mandatory word count.
- Keep the user's subject, intent, facts, counts, colors, framing, style, and constraints. Clarify useful visible details without changing the creative direction. Invent content only where the user asks you to; never fabricate factual data, claims, or citations.
- Quote text that must appear in the image, preserving spelling, case, punctuation, line breaks, and requested repetitions. Keep it distinct from instructions that must not be rendered. Any list of allowed text must include all requested headings, labels, and branding, scoped to their intended regions; do not say "only" one text block and then require another. Translation or replacement requests are exceptions to preserving the original wording.
- Add composition, medium, materials, light, and color cues only where they help this request. For natural photographs, use photorealistic language and believable texture rather than automatic studio polish or cinematic grading. Specify body framing, relative scale, gaze, and object contact when important to an action.
- Use task-specific detail: audience, concept, and exact copy for ads; layout, hierarchy, spacing, and real controls for interfaces; supplied data, labels, and relationships for diagrams and charts; ordered visual beats for comic panels; recognizable shapes and legibility at small sizes for logos. Do not impose these conventions on unrelated requests.
- When transparency is requested or must be retained, state a transparent background with clean alpha edges, not a solid backdrop or painted checkerboard. Do not add an unrequested shadow or restyle a cutout.
- Write visual instructions, not API settings or model-selection advice. Retain requested aspect ratio, composition, and background requirements.
- Before returning, check that no requirement was lost, no exclusion conflicts with required content, and no added detail prevents a requested change.`;

const generateSystemPrompt = `Refine the user's request into an image prompt. Describe the intended result, not a critique or a list of suggestions. Use the scene, subject, important details, and constraints to organize the brief when helpful. Do not add unrequested centering, camera settings, decoration, or aesthetic restrictions just to make the prompt longer.

${imagePromptRules}`;

const editSystemPrompt = `Refine the user's request using the supplied images. First distinguish a local edit from a new image that borrows reference elements; having references does not by itself mean "keep everything the same."
- Refer to inputs by their supplied numbers (Image 1, Image 2, etc.) and relevant visible descriptions. Assign only the roles needed: subject, style, clothing, or destination scene. Explain what comes from which image and where it goes. Do not renumber inputs or infer image contents from filenames.
- For a local edit, name the change and restate the important details to preserve, such as identity, product shape, layout, labels, or surrounding objects. Keep unrelated details unchanged, but allow the requested change and its necessary effects: new clothing must fit the pose, a moved object needs matching scale and contact shadows, and new weather may change light.
- For a new scene or style transfer, carry over only the requested reference features and explicit invariants. Do not freeze the source background, pose, layout, or lighting unless requested. Keep identity or product design when reusing that subject.
- For translation, change only the requested wording and preserve the design and unrelated content. Transcribe or translate visible text only when readable; do not guess unclear lettering. For sketch-to-render work, preserve layout, proportions, and perspective while adding plausible materials and light.
- For follow-up edits, restate the critical invariants from the supplied image and request, not an imagined conversation history. Resolve ambiguity conservatively without blocking an explicit redesign.

${imagePromptRules}`;

const videoWithReferenceSystemPrompt = `You are an expert prompt engineer for image-to-video generation (Sora 2) using a single reference frame. Rewrite the user's request into an actionable video directive that keeps fidelity to the reference image while describing motion precisely.

Rules:
- Return ONLY the raw prompt text. For complex requests with dialogue or multi-beat actions, use labeled sections (Cinematography:, Actions:, Dialogue:); otherwise use natural prose.
- Anchor to the reference image: subjects, environment, lighting, style, and camera perspective must stay consistent unless the user explicitly asks for changes.
- ONE camera move + ONE subject action per shot. Avoid compounding multiple complex motions.
- Describe motion in beats/counts: "takes three steps forward, pauses, turns head left" rather than vague "walks around."
- Specify camera explicitly: framing (wide/medium/close-up) + angle (eye-level, low-angle, overhead) + movement (slow dolly left, gentle push-in, handheld tracking, static tripod).
- Include lighting direction and 3-5 color palette anchors for visual stability (e.g., "warm amber key light from camera left; palette: burnt orange, cream, charcoal, forest green").
- Style anchors: use specific references ("16mm film grain", "anamorphic 2.0x lens", "180° shutter", "shallow DOF") rather than generic "cinematic."
- If text appears on screen, include it in "QUOTES" with typography notes (font style, placement, size, contrast).
- If dialogue is present, place it in a separate Dialogue: block with concise, natural lines. Label speakers consistently. 4-second clips support 1-2 short exchanges.
- Do not invent new objects or characters not in the reference; stay faithful to the composition.
- Length target: 80-120 words for detailed control; shorter for simple motions.`;

const videoPromptOnlySystemPrompt = `You are an expert prompt engineer for prompt-to-video generation (Sora 2) with no reference image. Rewrite the user's request into a detailed, visual directive that establishes scene, motion, and camera with precision.

Structure (use prose for simple requests; labeled sections for complex multi-beat or dialogue scenes):
1. Scene prose: environment, subjects, wardrobe/props, atmosphere
2. Cinematography: camera shot (wide/medium/close-up + angle), lens (e.g., 50mm spherical prime, anamorphic 2.0x), movement (slow dolly, tracking left-to-right, static tripod, handheld)
3. Actions: describe motion in beats/counts ("cyclist pedals three times, brakes, stops at crosswalk") with timing cues
4. Dialogue (if any): concise natural lines, labeled speakers, placed in separate block

Rules:
- Return ONLY the raw prompt text. Use labeled sections (Cinematography:, Actions:, Dialogue:) when dialogue or multi-beat actions are present.
- ONE camera move + ONE subject action per shot. Simpler shots are more reliable.
- Describe motion with specific beats: steps, gestures, pauses with counts—not vague verbs.
- Specify lighting direction and quality: "soft window light with warm lamp fill, cool rim from hallway" rather than "brightly lit."
- Include 3-5 color palette anchors for stability (e.g., "palette: amber, cream, walnut brown, slate blue").
- Style anchors: use specific references ("1970s film stock", "16mm black-and-white", "IMAX-scale epic", "hand-painted 2D/3D hybrid") and lens/filter specs ("Black Pro-Mist 1/4", "180° shutter", "shallow DOF") rather than generic "cinematic" or "beautiful."
- If text appears on screen, include it in "QUOTES" with typography notes (font style, placement, size, contrast).
- Shorter clips (4s) follow instructions better than longer ones; note if the user implies duration.
- Do not invent factual details the user did not imply; stay faithful to their intent.
- Length target: 80-120 words for detailed control.`;

const surprisePromptRules = `Create one original image idea and return only its ready-to-use prompt. Build around a coherent visual idea, not a pile of unrelated surprises. Specify the subject, composition, medium, and a few useful details of light, color, or materials. Use enough detail to make it drawable without padding.
- Match the requested visual format: practical layout and readable controls for an interface, clear visual relationships for a diagram, a strong simple silhouette for a logo. Do not fabricate factual claims, statistics, or citations.
- Include text only if it serves the concept. Quote the exact wording and specify its placement and legibility; exclude other text without removing required reference labels.
- Keep API settings and model advice out of the prompt. For a transparent asset, describe clean alpha edges without a solid backdrop, painted checkerboard, or unnecessary shadow.
- Keep content family-friendly and avoid real public figures, brands, and political/geopolitical references.`;

const surpriseGenerateSystemPrompt = `${surprisePromptRules}
Invent a fresh scene with an imaginative but coherent combination of subjects or materials rather than a familiar stock-image concept.`;

const surpriseEditSystemPrompt = `${surprisePromptRules}
Ground the idea in the supplied images, naming each relevant reference by its original number and visible role. Choose either one focused edit or a new scene that borrows specific elements. Introduce a distinctive visual change, not merely cleaner typography or generic polishing. For an edit, state the change and the important details to preserve, allowing necessary changes to light, shadows, or contact. For a new scene, preserve the reused subject's identity or product design, not the whole source composition. Keep retained label text unchanged; do not invent unclear lettering or unseen details from filenames.`;

export type PromptEnhanceImagePayload = {
    dataUrl: string;
    alt?: string;
};

export class PromptReferenceImageError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
        this.name = 'PromptReferenceImageError';
    }
}

export function parsePromptReferenceImages(input: unknown): PromptEnhanceImagePayload[] {
    if (input === undefined || input === null) return [];
    if (!Array.isArray(input)) {
        throw new PromptReferenceImageError('Reference images must be an array.');
    }
    if (input.length > 5) {
        throw new PromptReferenceImageError('Provide at most 5 reference images.');
    }

    // Reject the whole request rather than silently shifting the user's image indexes.
    return input.map((candidate, index) => {
        const dataUrl = typeof candidate === 'string'
            ? candidate
            : candidate && typeof candidate === 'object' && 'dataUrl' in candidate
                ? candidate.dataUrl
                : undefined;
        const alt = candidate && typeof candidate === 'object' && 'alt' in candidate && typeof candidate.alt === 'string'
            ? candidate.alt
            : undefined;
        if (typeof dataUrl !== 'string') {
            throw new PromptReferenceImageError(`Reference image ${index + 1} must be an image data URL.`);
        }
        if (dataUrl.length > 7 * 1024 * 1024) {
            throw new PromptReferenceImageError(`Reference image ${index + 1} payload is too large.`, 413);
        }
        const match = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/i.exec(dataUrl);
        const base64 = match?.[1].replace(/[\r\n]/g, '');
        if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
            throw new PromptReferenceImageError(`Reference image ${index + 1} must be a base64 PNG, JPEG, WebP, or GIF data URL.`);
        }
        const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
        if (base64.length * 3 / 4 - padding > 5 * 1024 * 1024) {
            throw new PromptReferenceImageError(`Reference image ${index + 1} payload is too large.`, 413);
        }
        return { dataUrl, alt };
    });
}

export type BuildPromptEnhanceOptions = {
    referenceImages?: PromptEnhanceImagePayload[];
    videoHasReferenceImage?: boolean;
};

type ResponseInputContent = OpenAI.Responses.ResponseInputContent;
type ResponseInputItem = OpenAI.Responses.ResponseInputItem;

export type PromptEnhanceParams = {
    instructions: string;
    input: string | ResponseInputItem[];
};

function buildReferenceInput(
    prompt: string,
    images: PromptEnhanceImagePayload[],
    detail: 'auto' | 'low'
): ResponseInputItem[] {
    const content: ResponseInputContent[] = [];
    images.forEach((image, index) => {
        content.push({ type: 'input_text', text: `Image ${index + 1}${image.alt ? `: ${image.alt}` : ''}` });
        content.push({ type: 'input_image', image_url: image.dataUrl, detail });
    });
    content.push({ type: 'input_text', text: prompt });
    return [{ role: 'user', content }];
}

export function buildPromptEnhanceInput(
    mode: 'generate' | 'video',
    prompt: string,
    options?: BuildPromptEnhanceOptions
): PromptEnhanceParams {
    const referenceImages = options?.referenceImages ?? [];
    const hasReferenceImages = referenceImages.length > 0;

    const instructions =
        mode === 'video'
            ? options?.videoHasReferenceImage
                ? videoWithReferenceSystemPrompt
                : videoPromptOnlySystemPrompt
            : hasReferenceImages
                ? editSystemPrompt
                : generateSystemPrompt;

    if (!hasReferenceImages) {
        return { instructions, input: prompt };
    }

    return { instructions, input: buildReferenceInput(prompt, referenceImages, mode === 'video' ? 'low' : 'auto') };
}

export type SurpriseMeMode = 'generate';

export type BuildSurpriseMeOptions = {
    referenceImages?: PromptEnhanceImagePayload[];
};

export function buildSurpriseMeInput(
    mode: SurpriseMeMode,
    options?: BuildSurpriseMeOptions
): PromptEnhanceParams {
    const referenceImages = options?.referenceImages ?? [];
    const hasReferenceImages = referenceImages.length > 0;
    const instructions =
        hasReferenceImages ? surpriseEditSystemPrompt : surpriseGenerateSystemPrompt;

    const themes = [
        'photorealistic photography',
        'editorial illustration',
        'isometric infographic',
        'mobile UI mockup',
        'product hero shot',
        'minimalist logo design',
        'hand-drawn storybook scene',
        'macro still life',
        'vintage poster design',
        'architectural render'
    ];
    const pickedTheme = themes[Math.floor(Math.random() * themes.length)];

    const seed = hasReferenceImages
        ? `Create a fresh image idea using the supplied references: either a focused edit or a new scene borrowing specific elements.`
        : `Surprise me with a fresh image prompt. Try the mode: ${pickedTheme}. Pick a subject I would not expect.`;

    if (!hasReferenceImages) {
        return { instructions, input: seed };
    }

    return { instructions, input: buildReferenceInput(seed, referenceImages, 'auto') };
}
