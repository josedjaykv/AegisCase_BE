import { BaseEvent } from './base-event.interface';

export interface CaseCreatedEvent extends BaseEvent {
  event_type: 'case.created';
  payload: {
    case_code: string;
    title: string;
    priority: string;
    leader_user_id: string;
  };
}

export interface CaseUpdatedEvent extends BaseEvent {
  event_type: 'case.updated';
  payload: {
    case_code: string;
    changed_fields: string[];
  };
}

export interface CaseClosedEvent extends BaseEvent {
  event_type: 'case.closed';
  payload: {
    case_code: string;
    closed_by_user_id: string;
  };
}

export interface CaseArchivedEvent extends BaseEvent {
  event_type: 'case.archived';
  payload: {
    case_code: string;
    archived_by_user_id: string;
  };
}
