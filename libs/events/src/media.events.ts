import { BaseEvent } from './base-event.interface';

export interface MediaUploadedEvent extends BaseEvent {
  event_type: 'media.uploaded';
  payload: {
    url: string;
    entity_type: string;
    entity_id: string;
  };
}
