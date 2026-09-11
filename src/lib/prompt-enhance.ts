import type OpenAI from 'openai';

const imagePromptRules = `Target gpt-image-2.5-flare (the default, speed-oriented model) and gpt-image-2.5-sunburst (quality-oriented). The same prompting principles apply to both.
- Return only the image prompt, without commentary, markdown fences, or quotes around the whole response. Prefer brief prose; use short labeled sections only when complex requirements benefit.
- Preserve every user-specified fact, name, count, color, placement, aspect ratio, exclusion, and change/preserve constraint. Do not invent data, citations, claims, branding, or extra subjects. User specifics take precedence over general advice.
- Keep literal text verbatim, including spelling, capitalization, punctuation, and line breaks. Quote required copy; retain its requested placement, typography, and repetition count. Add legibility and no-extra-text constraints when appropriate, without removing required or preserved text. Optional spelling cues must not replace the literal wording.
- Identify references by their original numbers (Image 1, Image 2, etc.) and roles, and explain what is borrowed or moved and where. Never renumber images or invent unseen details from filenames.
- Describe visible composition, materials, light, color, and medium only as needed. If photorealism is requested, say "photorealistic" and use plausible texture, framing, gaze, and object interaction. Camera specifications are appearance cues, not physical guarantees.
- Adapt to the artifact: practical layout and controls for interfaces; supplied labels, data, relationships, and readable hierarchy for charts or educational visuals; clear visual beats for comic panels; simple scalable shapes for logos. Describe the finished result, not critique or recommendations.
- For requested transparent assets, specify an isolated subject, clean alpha edges, and no solid backdrop or painted checkerboard; do not add an unrequested shadow. Preserve product geometry and label text. Do not impose an opaque background.
- Keep model, quality, resolution, format, and batch settings in API controls, not invented parameter instructions in the prompt; retain user-stated visual dimensions and background requirements.
- Use the shortest prompt that preserves the complete request. Do not pad to a word quota or truncate required details; avoid generic quality buzzwords.`;

const generateSystemPrompt = `Rewrite the user's image request into a clear production-ready prompt. Establish the intended artifact, scene, subject, important visible details, composition, and constraints. Add only useful details consistent with the request, not a new creative direction.

${imagePromptRules}`;

const editSystemPrompt = `Rewrite the user's request using the supplied reference images.
- For local edits, state what to change and its desired final state, then what must remain unchanged. Preserve relevant identity, geometry, pose, layout, camera angle, lighting, saturation, contrast, labels, arrows, and surrounding objects. "Keep everything else the same" applies only outside the requested changes.
- For a new reference-inspired image, identify which subject, style, palette, or composition to borrow and describe the new result. Do not impose pixel-for-pixel preservation, but retain every explicit invariant.
- Style transfer, scene changes, redesigns, and seasonal changes do not waive identity or layout constraints. When intent is ambiguous, stay close to the request rather than defaulting to a wholesale redesign.
- For translation, replace only the requested text and preserve layout and other content; translate only when asked. For sketch-to-render work, preserve specified proportions and perspective rather than inventing elements.
- For iterative edits, restate critical invariants and focus on the requested changes; do not claim prompting guarantees pixel-identical preservation.

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

const surprisePromptRules = `Create ONE unexpected, concrete image concept for gpt-image-2.5-flare (default) or gpt-image-2.5-sunburst. Return only a concise image prompt, usually one paragraph, with no explanation or word-count padding.
- Choose a distinctive subject, intended artifact, composition, medium, and useful material/light/color details; avoid generic quality buzzwords.
- Vary photography, illustration, product imagery, logos, interfaces, and structured visuals. Interfaces should look usable; diagrams need readable labels and coherent relationships, not invented factual claims or citations.
- If including text, quote the exact copy and specify placement, legible typography, and repetition count; exclude unintended extra text.
- Keep API settings separate from visual instructions. For transparent concepts, request clean alpha edges without a solid backdrop, painted checkerboard, or unrequested shadow.
- Keep content family-friendly and avoid real public figures, brands, and political/geopolitical references.`;

const surpriseGenerateSystemPrompt = `${surprisePromptRules}
Invent a fresh scene with an imaginative but coherent combination of subjects or materials rather than a familiar stock-image concept.`;

const surpriseEditSystemPrompt = `${surprisePromptRules}
Ground the idea in visible reference details. Choose either a specific edit with an explicit change/preserve boundary or a new scene that borrows named elements. Preserve identity, product geometry, and literal labels when retaining that subject; do not silently redesign unrelated details in a local edit. Identify each reference by its original number (Image 1, Image 2, etc.), assign its role, and explain how the inputs combine. Do not infer unseen image content from filenames.`;

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
        ? `Surprise me with a fresh, unexpected edit instruction for the reference image(s). Make it concrete and grounded in what is actually shown.`
        : `Surprise me with a fresh image prompt. Try the mode: ${pickedTheme}. Pick a subject I would not expect.`;

    if (!hasReferenceImages) {
        return { instructions, input: seed };
    }

    return { instructions, input: buildReferenceInput(seed, referenceImages, 'auto') };
}
