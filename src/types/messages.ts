import type { ActionId, PendingTask, SelectionContext } from './index';

export type RuntimeRequest =
  | {
      type: 'RUN_ACTION';
      actionId: ActionId;
      selection: SelectionContext;
      userInput?: string;
      presentation?: 'inline' | 'sidepanel';
    }
  | { type: 'GET_PENDING_TASK' }
  | { type: 'OPEN_SIDE_PANEL'; tabId: number }
  | { type: 'OPEN_OPTIONS' }
  | { type: 'REFRESH_CONTEXT_MENUS' }
  | { type: 'TEST_PROVIDER'; providerId: string }
  | { type: 'CLEAR_PENDING_TASK'; requestId: string };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

export type StreamClientMessage =
  | { type: 'START_STREAM'; task: PendingTask }
  | { type: 'CANCEL_REQUEST'; requestId: string };

export type StreamServerMessage =
  | { type: 'STREAM_START'; requestId: string; providerName: string; model: string }
  | { type: 'STREAM_CHUNK'; requestId: string; text: string }
  | { type: 'STREAM_COMPLETE'; requestId: string }
  | { type: 'STREAM_ERROR'; requestId: string; error: string; code?: string };
