import { BaseEvent } from './base-event.interface';

export interface InvolvedPersonLinkedEvent extends BaseEvent {
  event_type: 'involved.person.linked';
  payload: {
    case_id: string;
    involved_person_id: string;
    involvement_type: string;
  };
}

export interface InvolvedPersonUnlinkedEvent extends BaseEvent {
  event_type: 'involved.person.unlinked';
  payload: {
    case_id: string;
    involved_person_id: string;
  };
}
