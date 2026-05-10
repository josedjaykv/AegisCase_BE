import { BaseEvent } from './base-event.interface';

export interface TaskAssignedEvent extends BaseEvent {
  event_type: 'task.assigned';
  payload: {
    case_id: string;
    assigned_to_user_id: string;
    assigned_by_user_id: string;
    due_date?: string;
  };
}

export interface TaskCompletedEvent extends BaseEvent {
  event_type: 'task.completed';
  payload: {
    case_id: string;
    completed_by_user_id: string;
  };
}

export interface TaskOverdueEvent extends BaseEvent {
  event_type: 'task.overdue';
  payload: {
    case_id: string;
    assigned_to_user_id: string;
    due_date: string;
  };
}
