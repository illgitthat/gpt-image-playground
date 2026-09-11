import { EMPTY_PROMPT_DRAFT, promptDraftReducer as reduce } from '../src/lib/prompt-draft';
import { describe, expect, test } from 'bun:test';

describe('prompt edits', () => {
    test('a delayed enhancement cannot overwrite typing, even after reverting to the original', () => {
        let state = reduce(EMPTY_PROMPT_DRAFT, { type: 'edit', value: 'Original' });
        state = reduce(state, { type: 'request', id: 1 });
        state = reduce(state, { type: 'edit', value: 'New typing' });
        expect(reduce(state, { type: 'resolve', id: 1, text: 'Enhanced' }).text).toBe('New typing');
        state = reduce(state, { type: 'edit', value: 'Original' });
        expect(reduce(state, { type: 'resolve', id: 1, text: 'Enhanced' }).text).toBe('Original');
    });

    test('only the newest prompt-tool request may update the draft', () => {
        let state = reduce(EMPTY_PROMPT_DRAFT, { type: 'request', id: 1 });
        state = reduce(state, { type: 'request', id: 2 });
        state = reduce(state, { type: 'resolve', id: 1, text: 'Old suggestion' });
        state = reduce(state, { type: 'finish', id: 1 });
        expect(state.text).toBe('');
        expect(reduce(state, { type: 'resolve', id: 2, text: 'New suggestion' }).text).toBe('New suggestion');
    });

    test('undo restores the exact previous prompt, including an empty one', () => {
        for (const original of ['', 'Exact "COPY"\nSecond line']) {
            let state = reduce(EMPTY_PROMPT_DRAFT, { type: 'edit', value: original });
            state = reduce(state, { type: 'request', id: 1 });
            state = reduce(state, { type: 'resolve', id: 1, text: 'A suggestion' });
            state = reduce(state, { type: 'undo' });
            expect(state.text).toBe(original);
            expect(state.undoText).toBeNull();
        }
    });

    test('manual edits clear undo rather than allowing it to discard later work', () => {
        let state = reduce(EMPTY_PROMPT_DRAFT, { type: 'request', id: 1 });
        state = reduce(state, { type: 'resolve', id: 1, text: 'A suggestion' });
        state = reduce(state, { type: 'edit', value: (text) => `${text} with my edits` });
        expect(reduce(state, { type: 'undo' }).text).toBe('A suggestion with my edits');
    });
});
