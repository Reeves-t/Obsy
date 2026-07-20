import type { SharedLinkMetadata } from '@/services/sharedLinkService';

export type VoicePhase = 'recording' | 'processing' | 'ready' | 'error';

export type ComposerAttachment =
    | { kind: 'none' }
    | { kind: 'photo'; localUri: string }
    | {
          kind: 'voice';
          phase: VoicePhase;
          storagePath?: string | null;
          transcript?: string;
          durationSec?: number;
          transcriptError?: boolean;
      }
    | { kind: 'link'; meta: SharedLinkMetadata };
