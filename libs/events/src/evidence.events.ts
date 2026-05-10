import { BaseEvent } from './base-event.interface';

export interface EvidenceAddedEvent extends BaseEvent {
  event_type: 'evidence.added';
  payload: {
    case_id: string;
    evidence_type: string;
    custodian_user_id: string;
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
