import type { SetStateAction } from 'react';

export type PromptDraft = {
    text: string;
    pendingRequest: number | null;
    undoText: string | null;
};

type PromptAction =
    | { type: 'edit'; value: SetStateAction<string> }
    | { type: 'request'; id: number }
    | { type: 'resolve'; id: number; text: string }
    | { type: 'finish'; id: number }
    | { type: 'undo' };

export const EMPTY_PROMPT_DRAFT: PromptDraft = { text: '', pendingRequest: null, undoText: null };

export function promptDraftReducer(state: PromptDraft, action: PromptAction): PromptDraft {
    switch (action.type) {
        case 'edit':
            return {
                text: typeof action.value === 'function' ? action.value(state.text) : action.value,
                pendingRequest: null,
                undoText: null
            };
        case 'request':
            return { ...state, pendingRequest: action.id };
        case 'resolve':
            if (state.pendingRequest !== action.id) return state;
            return {
                text: action.text,
                pendingRequest: null,
                undoText: action.text === state.text ? state.undoText : state.text
            };
        case 'finish':
            return state.pendingRequest === action.id ? { ...state, pendingRequest: null } : state;
        case 'undo':
            return state.undoText === null ? state : { text: state.undoText, pendingRequest: null, undoText: null };
    }
}
