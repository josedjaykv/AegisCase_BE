export const EventPatterns = {
  // Case
  CASE_CREATED:            'case.created',
  CASE_UPDATED:            'case.updated',
  CASE_CLOSED:             'case.closed',
  CASE_ARCHIVED:           'case.archived',
  // Evidence
  EVIDENCE_ADDED:          'evidence.added',
  EVIDENCE_TRANSFERRED:    'evidence.transferred',
  EVIDENCE_ARCHIVED:       'evidence.archived',
  // Task
  TASK_ASSIGNED:           'task.assigned',
  TASK_COMPLETED:          'task.completed',
  TASK_OVERDUE:            'task.overdue',
  // Involved
  INVOLVED_PERSON_LINKED:  'involved.person.linked',
  // Media
  MEDIA_UPLOADED:          'media.uploaded',
} as const;

export type EventPattern = (typeof EventPatterns)[keyof typeof EventPatterns];
