# Agent Instructions for GPT Image Playground

## API Configuration

This project uses an OpenAI-compatible gateway, NOT the Azure OpenAI SDK directly.

### Client Setup

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: 'unused', // Required by SDK but not used
    baseURL: process.env.AZURE_OPENAI_ENDPOINT,
    defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
    },
});
```

Key points:
- Use standard `openai` package, NOT `@azure/openai`
- Authentication is via `api-key` header (not Bearer token, not Azure SDK auth)
- `apiKey` parameter is required by SDK but ignored - set to any string
- No API version parameter needed in general

### Environment Variables

```
AZURE_OPENAI_ENDPOINT=https://...y/openai/v1
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_TEXT_MODEL=gpt-chat-latest  # Optional, for prompt enhancement
```

**Warning**: System environment variables can override `.env.local`. If you have `AZURE_OPENAI_ENDPOINT` set system-wide, it may conflict.

## Responses API

All text generation uses the Responses API, NOT chat completions.

### Basic Usage

```typescript
const response = await client.responses.create({
    model: 'gpt-5.3-chat',
    instructions: 'System prompt goes here',  // NOT in input array
    input: 'User message here',  // Can be string or ResponseInputItem[]
});

const text = response.output_text;
```

Key differences from chat completions:
- System prompt uses `instructions` parameter (not a message with role: 'system')
- User content uses `input` parameter
- Response text is in `response.output_text`

### Multimodal Input

```typescript
const response = await client.responses.create({
    model: 'gpt-4.1',
    instructions: 'Describe what you see',
    input: [{
        role: 'user',
        content: [
            { type: 'input_text', text: 'What is in this image?' },
            { type: 'input_image', image_url: 'data:image/png;base64,...', detail: 'low' }
        ]
    }]
});
```

## Image Generation

Image generation uses the Responses API with `image_generation` tool - NOT the legacy `/images/generations` endpoint.

### Required Headers

Image generation requires special headers:

```typescript
const apiClient = new OpenAI({
    apiKey: 'unused',
    baseURL: process.env.AZURE_OPENAI_ENDPOINT,
    defaultHeaders: {
        'api-key': process.env.AZURE_OPENAI_API_KEY,
        'x-ms-oai-image-generation-deployment': 'gpt-image-2.5-flare',
        'api_version': 'preview',
    },
});
```

### Generation Request

```typescript
const response = await apiClient.responses.create({
    model: 'gpt-5.3-chat',  // Chat model orchestrates image generation
    input: [{
        role: 'user',
        content: 'A beautiful sunset over mountains'
    }],
    tools: [{ type: 'image_generation' }],
});
```

### With Parameters

```typescript
const response = await apiClient.responses.create({
    model: 'gpt-5.3-chat',
    input: [{ role: 'user', content: prompt }],
    tools: [{
        type: 'image_generation',
        quality: 'high',           // 'low' | 'medium' | 'high'
        size: '1024x1024',         // '1024x1024' | '1536x1024' | '1024x1536' | 'auto'
        output_format: 'png',      // 'png' | 'jpeg' | 'webp'
        background: 'auto',        // 'auto' | 'transparent' | 'opaque'
    }],
});
```

### Image Editing (with input images)

```typescript
const inputContent: ResponseInputContent[] = [];

// Add input images
images.forEach((img, i) => {
    inputContent.push({
        type: 'input_image',
        image_url: img.dataUrl,  // data:image/png;base64,...
        detail: 'auto'
    });
});

// Add the edit instruction
inputContent.push({ type: 'input_text', text: editPrompt });

const response = await apiClient.responses.create({
    model: 'gpt-5.3-chat',
    input: [{ role: 'user', content: inputContent }],
    tools: [{ type: 'image_generation', ...params }],
});
```

### Extracting Generated Images

```typescript
const generatedImages: string[] = [];

for (const item of response.output) {
    if (item.type === 'image_generation_call') {
        generatedImages.push(item.result);  // base64 string (no data URL prefix)
    }
}

// Convert to data URL if needed
const dataUrl = `data:image/png;base64,${generatedImages[0]}`;
```

### Streaming Image Generation

Streaming uses the Responses API with `stream: true`. The model must be a chat model (e.g., `gpt-5.3-chat`), NOT the image model directly.

```typescript
const response = await apiClient.responses.create({
    model: 'gpt-5.3-chat',  // Chat model orchestrates image generation
    input: [{ role: 'user', content: prompt }],
    tools: [{
        type: 'image_generation',
        partial_images: 2,  // Number of partial images to receive
        // ... other params
    }],
    stream: true
});

// Process stream events
for await (const event of response) {
    switch (event.type) {
        case 'response.image_generation_call.in_progress':
            // Generation started
            break;
        case 'response.image_generation_call.generating':
            // Actively generating
            break;
        case 'response.image_generation_call.partial_image':
            // Partial image available
            const partialB64 = event.partial_image_b64;
            const partialIndex = event.partial_image_index;
            break;
        case 'response.output_item.done':
            // Final image in event.item.result (if type === 'image_generation_call')
            break;
        case 'response.completed':
            // Generation complete, usage info in event.response.usage
            break;
    }
}
```

**Note**: The legacy `/images/generations` endpoint is NOT available on this gateway. Streaming must use the Responses API.

### GPT Image 2.5 gateway constraints

- Supported deployments: `gpt-image-2.5-flare` (default) and `gpt-image-2.5-sunburst`.
- Select the gateway deployment through `x-ms-oai-image-generation-deployment` only. Do not set the image tool's `model` field for gateway requests; its validator rejects the new model IDs.
- `AZURE_OPENAI_DEPLOYMENT_NAME` is no longer used. Older models are not supported.
- The app currently caps batches at 2 images and requests at 2/minute/model to match the maintainer's personal deployment. This is not a universal model quota. Do not add automatic retries that spend extra quota.
- Only the four existing size presets and `auto`/`low`/`medium`/`high` quality are exposed. The tested gateway rejected 2K/4K sizes and `xhigh`; these are gateway observations, not universal GPT Image 2.5 limits. The model documentation supports higher settings.
- Both models support transparency. JPEG cannot preserve alpha.
- The gateway accepts PNG/JPEG, not WebP. Encode WebP locally from PNG with Sharp.
- Native output dimensions can differ from the requested preset. Preserve native image data.
- Responses usage currently describes the text orchestrator, not image-token usage. Do not price those output tokens as image tokens.
- Follow https://developers.openai.com/api/docs/guides/image-prompting and the local `prompt-guide.md` when changing image prompts.

### App image streaming

- `/api/images` sends each final image once in a `completed` event, with its index and image payload.
- `done` contains `completed_count`, usage, and any partial-failure details, not image payloads. The client assembles images in index order and verifies the count against received `completed` events.
- On cancellation or a broken stream, keep only completed images already received.
- New image history entries have `costDetails: null`; Responses-level usage is not a source of image pricing, even when it includes an input-modality breakdown.

## Video Generation (Sora)

Video generation uses raw fetch with the gateway's Sora endpoint.

```typescript
const response = await fetch(
    `${process.env.AZURE_OPENAI_ENDPOINT}/sora/generations?api_version=preview`,
    {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.AZURE_OPENAI_API_KEY!,
        },
        body: JSON.stringify({
            prompt: videoPrompt,
            // Optional: include image_url for image-to-video
        }),
    }
);
```

Video generation is async - poll the returned ID until complete.

## Prompt Enhancement

The `buildPromptEnhanceInput` function returns `{ instructions, input }` format for Responses API:

```typescript
import { buildPromptEnhanceInput } from '@/lib/prompt-enhance';

const { instructions, input } = buildPromptEnhanceInput(
    'generate',  // 'generate' | 'edit' | 'video'
    userPrompt,
    { referenceImages: [...] }  // optional
);

const response = await client.responses.create({
    model: 'gpt-4.1',
    instructions,
    input,
});

const enhancedPrompt = response.output_text;
```

## Common Issues

### 404 Resource Not Found
- Check `AZURE_OPENAI_ENDPOINT` is correct (system env vars can override .env.local)
- Ensure endpoint ends with `/v1` for gateway

### 400 Bad Request on Image Generation
- Missing `x-ms-oai-image-generation-deployment` header
- Missing `api_version: 'preview'` header
- Using legacy `/images/generations` endpoint instead of Responses API

### TypeScript Errors
- Use `ResponseInputContent` and `ResponseInputItem` types from `OpenAI.Responses`
- Image generation output items have `type === 'image_generation_call'` with `result` property
