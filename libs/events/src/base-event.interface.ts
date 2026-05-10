export interface BaseEvent {
  event_id: string;
  event_type: string;
  occurred_at: Date;
  actor_user_id: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, any>;
}
