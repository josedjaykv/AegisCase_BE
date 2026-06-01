export const EventPatterns = {
  // Case
  CASE_CREATED:            'case.created',
  CASE_UPDATED:            'case.updated',
  CASE_CLOSED:             'case.closed',
  CASE_ARCHIVED:           'case.archived',
  // Evidence
  EVIDENCE_ADDED:          'evidence.added',
  EVIDENCE_UPDATED:        'evidence.updated',
  EVIDENCE_TRANSFERRED:    'evidence.transferred',
  EVIDENCE_ARCHIVED:       'evidence.archived',
  EVIDENCE_CUSTODY_ACCESSED: 'evidence.custody.accessed',
  EVIDENCE_MEDIA_VIEWED:   'evidence.media.viewed',
  // Task
  TASK_ASSIGNED:           'task.assigned',
  TASK_COMPLETED:          'task.completed',
  TASK_OVERDUE:            'task.overdue',
  // Involved
  INVOLVED_PERSON_LINKED:   'involved.person.linked',
  INVOLVED_PERSON_UNLINKED: 'involved.person.unlinked',
  // Media
  MEDIA_UPLOADED:          'media.uploaded',
} as const;

export type EventPattern = (typeof EventPatterns)[keyof typeof EventPatterns];
