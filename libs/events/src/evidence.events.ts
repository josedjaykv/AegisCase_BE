import { BaseEvent } from './base-event.interface';

export interface EvidenceAddedEvent extends BaseEvent {
  event_type: 'evidence.added';
  payload: {
    case_id: string;
    evidence_type: string;
    custodian_user_id: string;
    title?: string;
  };
}

export interface EvidenceTransferredEvent extends BaseEvent {
  event_type: 'evidence.transferred';
  payload: {
    case_id: string;
    previous_custodian_id: string;
    new_custodian_id: string;
    transfer_reason?: string;
  };
}

export interface EvidenceArchivedEvent extends BaseEvent {
  event_type: 'evidence.archived';
  payload: {
    case_id: string;
    archived_by_user_id: string;
  };
}

/**
 * A user deliberately took custody of evidence over themselves (e.g. to be allowed
 * to download its files). Distinct from `evidence.transferred`, which is an
 * ADMIN/DETECTIVE re-assignment to another user.
 */
export interface EvidenceCustodyAccessedEvent extends BaseEvent {
  event_type: 'evidence.custody.accessed';
  payload: {
    case_id: string;
    previous_custodian_id: string | null;
    new_custodian_id: string;
    reason: string;
  };
}

/**
 * A user viewed/previewed a media file attached to evidence (no custody change).
 * Pure traceability — emitted only on an explicit viewer access, not thumbnails.
 */
export interface EvidenceMediaViewedEvent extends BaseEvent {
  event_type: 'evidence.media.viewed';
  payload: {
    evidence_id: string;
    media_id: string;
  };
}
