# Investigation Management Web System
## Technical and Business Plan — Version 1.0

---

## 1. General Description

The system aims to manage investigations through the registration and administration of cases, involved persons, evidence, and operational tasks.

The platform will be based on a microservices architecture and will include role-based access control.

**The system must enable:**
- Centralize investigation information
- Maintain event traceability
- Manage evidence and chain of custody
- Administer operational tasks
- Control permissions by user type

---

## 2. System Roles

### 2.1 Administrator

The administrator has full system access.

**Can:**
- Create, edit, and delete cases
- Create users and assign roles
- Manage evidence (create and delete)
- Manage tasks
- Query audit logs
- Manage general configurations
- Archive and reopen cases
- Archive evidence

### 2.2 Detective

The detective is responsible for operational investigation management.

**Can:**
- Create and update cases
- Associate persons with cases
- Register and update evidence status
- Create and assign tasks
- Query traceability
- Close cases
- Transfer evidence custody
- Link users to case (assign team)

**Cannot:**
- Delete cases
- Delete evidence
- Manage users
- Archive cases
- Reopen archived cases

### 2.3 Analyst

The analyst participates in investigation support activities.

**Can:**
- Query cases
- Query persons
- Query evidence
- Query chain of custody
- Update assigned tasks
- Mark tasks as completed
- Register operational observations
- Upload multimedia files

**Cannot:**
- Delete records
- Manage users
- Close cases
- Register evidence
- Create cases
- Create tasks
- Cancel tasks
- Register involved persons

---

## 3. Entities and Data Dictionary

### 3.1 User

Operational entity local to the system. Login and global identity are managed with Keycloak; this table stores the user's functional profile.

| Field              | Type     | Nullable | Description                         |
|--------------------|----------|:--------:|------------------------------------|
| id                 | UUID     | No       | User internal identifier           |
| keycloak_user_id   | string   | No       | Identifier in Keycloak (UNIQUE)    |
| first_names        | string   | No       | User first names                   |
| last_names         | string   | No       | User last names                    |
| document           | string   | No       | Identity document (UNIQUE)         |
| birth_date         | date     | Yes      | Birth date                         |
| role               | enum     | No       | ADMIN, DETECTIVE, or ANALYST       |
| job_title          | string   | Yes      | Operational job title              |
| created_at         | datetime | No       | Creation date                      |
| updated_at         | datetime | No       | Update date                        |

---

### 3.2 Case

Represents an investigation registered in the system.

| Field              | Type     | Nullable | Description                        |
|--------------------|----------|:--------:|------------------------------------|
| id                 | UUID     | No       | Case internal identifier           |
| case_code          | string   | No       | Unique code (UNIQUE)               |
| title              | string   | No       | Case title                         |
| description        | text     | Yes      | Case description                   |
| priority           | enum     | No       | Case operational priority          |
| status             | enum     | No       | Current status (OPEN, UNDER_INVESTIGATION, PAUSED, CLOSED) |
| leader_user_id     | UUID     | No       | Case leader user (FK)              |
| created_by_user_id | UUID     | No       | Case creator user (FK)             |
| archived           | boolean  | No       | Indicates if case is archived      |
| archived_at        | datetime | Yes      | Archive date                       |
| created_at         | datetime | No       | Creation date                      |
| updated_at         | datetime | No       | Update date                        |

**Rules:**
- Every case must have an assigned leader
- Every case must register the creator user
- Only administrators can delete cases
- State changes must be recorded in audit
- A closed case cannot be modified operationally
- Only administrators can reopen closed cases

---

### 3.3 Case_Team

Relationship table between case and team member users.

| Field     | Type     | Nullable | Description                        |
|-----------|----------|:--------:|------------------------------------|
| case_id   | UUID     | No       | Associated case (PK/FK)            |
| user_id   | UUID     | No       | Associated user (PK/FK)            |
| team_role | enum     | No       | Role within case: CREATOR, LEAD, MEMBER |
| linked_at | datetime | No       | Link date                          |

**Composite primary key:** (case_id, user_id)

**Purpose:** A case can have multiple users (detectives or analysts) who support the case. The team receives tasks from the case leader.

---

### 3.4 Involved_Person

Represents a person related to one or more cases. Not a system user.

| Field         | Type     | Nullable | Description                        |
|---------------|----------|:--------:|------------------------------------|
| id            | UUID     | No       | Involved person identifier         |
| first_names   | string   | No       | First name (MANDATORY)             |
| last_names    | string   | Yes      | Last names                         |
| document      | string   | Yes      | Identity document (UNIQUE)         |
| observations  | text     | Yes      | General observations               |
| created_at    | datetime | No       | Creation date                      |
| updated_at    | datetime | No       | Update date                        |

**Note:** The only mandatory field when creating an involved person is the first name, as other information may not be available initially.

**Rules:**
- A person can be associated with multiple cases
- A person should not be deleted if they belong to active cases

---

### 3.5 Case_Involved_Person

Relationship table between case and involved person. The relationship type lives here.

| Field              | Type | Nullable | Description                        |
|--------------------|------|:--------:|------------------------------------|
| case_id            | UUID | No       | Associated case (PK/FK)            |
| involved_person_id | UUID | No       | Associated involved person (PK/FK) |
| involvement_type   | enum | No       | VICTIM, SUSPECT, WITNESS, OTHER    |
| observations       | text | Yes      | Specific observations              |

**Composite primary key:** (case_id, involved_person_id)

---

### 3.6 Evidence

Represents a physical or digital item associated with a case.

| Field                | Type     | Nullable | Description                        |
|----------------------|----------|:--------:|------------------------------------|
| id                   | UUID     | No       | Evidence identifier                |
| case_id              | UUID     | No       | Associated case (FK)               |
| evidence_type        | enum     | No       | Evidence type (system-defined)     |
| description          | text     | No       | Evidence description               |
| evidence_status      | enum     | No       | Status: REGISTERED, IN_CUSTODY, TRANSFERRED, ARCHIVED |
| current_custodian_id | UUID     | Yes      | Current custodian user (FK)        |
| created_by_user_id   | UUID     | No       | Registering user (FK)              |
| archived             | boolean  | No       | Indicates if archived              |
| archived_at          | datetime | Yes      | Archive date                       |
| created_at           | datetime | No       | Creation date                      |
| updated_at           | datetime | No       | Update date                        |

**Rules:**
- All evidence must belong to a case
- All evidence must maintain custody history
- All modifications must generate traceability
- Only administrators can delete evidence
- Evidence deletion must be logical (not physical)

---

### 3.7 Chain_of_Custody

History of transfers and custodians of evidence.

| Field                  | Type     | Nullable | Description                        |
|------------------------|----------|:--------:|------------------------------------|
| id                     | UUID     | No       | Record identifier                  |
| evidence_id            | UUID     | No       | Associated evidence (FK)           |
| previous_custodian_id  | UUID     | Yes      | Previous custodian (FK)            |
| new_custodian_id       | UUID     | No       | New custodian (FK)                 |
| transferred_by_user_id | UUID     | No       | User who performed transfer (FK)   |
| transfer_reason        | text     | Yes      | Transfer reason                    |
| created_at             | datetime | No       | Record date and time               |

**Rules:**
- No movement must overwrite previous history
- All evidence must have at least one initial record
- When a user views evidence, an alert must show that viewing it will modify the chain of custody and they will be the last responsible

---

### 3.8 Task

Operational activity within a case.

| Field               | Type     | Nullable | Description                        |
|---------------------|----------|:--------:|------------------------------------|
| id                  | UUID     | No       | Task identifier                    |
| case_id             | UUID     | No       | Associated case (FK)               |
| title               | string   | No       | Task title                         |
| description         | text     | Yes      | Detailed description               |
| priority            | enum     | No       | Task priority                      |
| status              | enum     | No       | Status: PENDING, IN_PROGRESS, COMPLETED, OVERDUE, CANCELLED |
| due_date            | date     | Yes      | Due date                           |
| assigned_to_user_id | UUID     | No       | Responsible user (FK)              |
| assigned_by_user_id | UUID     | No       | User who assigned (FK)             |
| created_by_user_id  | UUID     | No       | User who created (FK)              |
| created_at          | datetime | No       | Creation date                      |
| updated_at          | datetime | No       | Update date                        |

**Rules:**
- All tasks must belong to a case
- Tasks can only be assigned to detectives or analysts
- Tasks must have an assigned responsible
- System must validate due dates
- Overdue tasks must be marked automatically
- A completed task cannot be reopened in V1

---

### 3.9 Media

Generic table for multimedia files associated with any entity.

| Field               | Type        | Nullable | Description                        |
|---------------------|-------------|:--------:|------------------------------------|
| id                  | UUID        | No       | File identifier                    |
| url                 | string      | No       | File location (on AWS S3)          |
| entity_type         | enum        | No       | Associated entity type: CASE, TASK, EVIDENCE, INVOLVED_PERSON, USER |
| entity_id           | UUID/string | No       | Entity identifier                  |
| uploaded_by_user_id | UUID        | No       | Uploading user (FK)                |
| created_at          | datetime    | No       | Upload date                        |

---

### 3.10 Audit

Record of traceability for critical actions.

| Field          | Type        | Nullable | Description                        |
|----------------|-------------|:--------:|------------------------------------|
| id             | UUID        | No       | Event identifier                   |
| user_id        | UUID        | No       | User who performed the action (FK) |
| action         | string      | No       | Action executed                    |
| entity_type    | string      | No       | Affected entity                    |
| entity_id      | UUID/string | No       | Entity identifier                  |
| previous_state | string      | Yes      | Previous state                     |
| new_state      | string      | Yes      | New state                          |
| created_at     | datetime    | No       | Event date and time                |

**Rules:**
- Audit must not be manually modified
- Audit must maintain complete history
- Minimum information: user, action, entity, date/time, previous state, new state

---

## 4. Microservices Architecture

### 4.1 General Principle

Each microservice is responsible for its own functional domain and its own data persistence.

Communication between services is done in two ways:
- **REST** for queries and direct operations
- **Event-Driven** for notifications, audit, and automation

---

### 4.2 Technology Stack

**Backend:**
- NestJS
- TypeScript

**Database:**
- PostgreSQL (single instance with multiple schemas: case_db, task_db, evidence_db, etc.)

**Event Communication:**
- RabbitMQ

**Authentication:**
- Keycloak
- JWT for token validation

**Storage:**
- AWS S3 for multimedia files

**Monorepo Structure:**
```
backend/
├── apps/
│   ├── api-gateway/
│   ├── auth-service/
│   ├── user-service/
│   ├── case-service/
│   ├── involved-service/
│   ├── evidence-service/
│   ├── task-service/
│   ├── media-service/
│   └── audit-service/
├── libs/
│   ├── common/
│   ├── auth/
│   ├── dto/
│   ├── enums/
│   ├── events/
│   └── database/
└── docker-compose.yml
```

---

### 4.3 Microservices Map

#### 1. Auth Service
**Responsibility:** Authentication and authorization
**Base Technology:** Keycloak
**Functions:**
- User login
- JWT token issuance
- Role validation
- Session control
**Data:** Does not persist operational profile; that lives in User Service

#### 2. User Service
**Responsibility:** Operational profile of system users
**Entities:** User, User Media
**Functions:**
- Create and edit local profile
- Query users
- Associate keycloak_user_id
- Expose operational data to other services

#### 3. Case Service
**Responsibility:** Case management and case team
**Entities:** Case, Case_Team, Case Media
**Functions:**
- Create cases
- Edit cases
- Change states
- Archive cases
- Manage leader and team members

#### 4. Involved Service
**Responsibility:** Management of persons involved in investigations
**Entities:** Involved_Person, Case_Involved_Person, Involved_Person Media
**Functions:**
- Register involved persons
- Edit involved persons
- Relate involved persons with cases
- Define relationship type per case

#### 5. Evidence Service
**Responsibility:** Evidence management and custody
**Entities:** Evidence, Chain_of_Custody, Evidence Media
**Functions:**
- Register evidence
- Edit evidence
- Transfer custody
- Archive evidence
- Query custody history

#### 6. Task Service
**Responsibility:** Case task management
**Entities:** Task, Task Media
**Functions:**
- Create tasks
- Assign tasks
- Update tasks
- Mark overdue tasks
- Close tasks

#### 7. Media Service
**Responsibility:** Generic multimedia file management
**Entities:** Media
**Functions:**
- Register files
- Associate files with entities
- Query files by entity
- AWS S3 integration

#### 8. Audit Service
**Responsibility:** System traceability
**Entities:** Audit
**Functions:**
- Register critical events (listening on RabbitMQ)
- Maintain history
- Expose audit queries

#### 9. API Gateway
**Responsibility:** Single system entry point
**Functions:**
- Request routing
- Token validation
- Load balancing

---

### 4.4 Data Partitioning

- `Case` and `Case_Team` → Case Service
- `Involved_Person` and `Case_Involved_Person` → Involved Service
- `Evidence` and `Chain_of_Custody` → Evidence Service
- `Task` → Task Service
- `Media` → Media Service
- `Audit` → Audit Service
- `User` → User Service
- Keycloak → Auth Service

**IMPORTANT RULE:** Each microservice owns its data. Single PostgreSQL instance with separate schemas.

---

### 4.5 Inter-Microservice Communication

#### 1. REST Communication
Used for queries and direct operations between services.
**Tools:** Internal HTTP, Axios, NestJS HttpModule

#### 2. Event-Based Communication
RabbitMQ is used for notifications, audit, and automation.

---

## 5. Events and Communication

### 5.1 Event Conventions

Each event must have at minimum:
- `event_id`
- `event_type`
- `occurred_at`
- `actor_user_id`
- `entity_type`
- `entity_id`
- `payload`

### 5.2 Event Catalog

#### Case Events

**CaseCreated**
- Producer: Case Service
- Consumers: Audit Service, Notification Service, Task Service
- When: When creating a case

**CaseUpdated**
- Producer: Case Service
- Consumers: Audit Service
- When: When modifying relevant case data

**CaseClosed**
- Producer: Case Service
- Consumers: Audit Service, Notification Service
- When: When closing a case

**CaseArchived**
- Producer: Case Service
- Consumers: Audit Service, Notification Service
- When: When archiving a case

#### Involved Person Events

**InvolvedPersonLinked**
- Producer: Involved Service
- Consumers: Audit Service, Notification Service
- When: When linking an involved person to a case

#### Evidence Events

**EvidenceAdded**
- Producer: Evidence Service
- Consumers: Audit Service, Notification Service
- When: When registering evidence

**EvidenceTransferred**
- Producer: Evidence Service
- Consumers: Audit Service, Notification Service
- When: When transferring custody

**EvidenceArchived**
- Producer: Evidence Service
- Consumers: Audit Service, Notification Service
- When: When archiving evidence

#### Task Events

**TaskAssigned**
- Producer: Task Service
- Consumers: Audit Service, Notification Service
- When: When assigning a task to a user

**TaskCompleted**
- Producer: Task Service
- Consumers: Audit Service, Notification Service
- When: When completing a task

**TaskOverdue**
- Producer: Task Service
- Consumers: Audit Service, Notification Service
- When: When a task exceeds its due date

#### Multimedia Events

**MediaUploaded**
- Producer: Media Service
- Consumers: Audit Service
- When: When uploading a multimedia file

### 5.3 Minimum Mandatory Events V1

- CaseCreated
- CaseClosed
- CaseArchived
- EvidenceAdded
- EvidenceTransferred
- TaskAssigned
- TaskCompleted
- TaskOverdue
- InvolvedPersonLinked

---

## 6. Functional Requirements

| ID | Requirement | Description |
|----|-----------|-------------|
| RF-01 | Authentication Management | System must allow authentication via Keycloak |
| RF-02 | Role Management | System must control access by roles: ADMIN, DETECTIVE, ANALYST |
| RF-03 | Case Management | Create, edit, query cases, change state, assign leaders |
| RF-04 | Person Management | Register persons, associate persons with cases, query related persons |
| RF-05 | Evidence Management | Register evidence, upload files, query evidence, update status, query history |
| RF-06 | Task Management | Create tasks, assign tasks, update tasks, query tasks, mark as completed |
| RF-07 | Audit | System must record critical business actions |
| RF-08 | Event Notifications | System must publish internal events for inter-microservice communication |

---

## 7. Non-Functional Requirements

| ID | Requirement | Description |
|----|-----------|-------------|
| RNF-01 | Architecture | System must implement microservices-based architecture |
| RNF-02 | Communication | System must support REST communication and event-based communication |
| RNF-03 | Security | System must implement JWT-based authentication and authorization |
| RNF-04 | Scalability | Microservices must be independently deployable |
| RNF-05 | Persistence | Each microservice must have its own data persistence layer |
| RNF-06 | Availability | System must handle errors without affecting the entire platform |
| RNF-07 | Traceability | Critical actions must maintain audit history |

---

## 8. Technical Consistency Criteria

- All entities use `UUID` as identifier
- Tables use `snake_case`
- Date/time fields are handled in UTC
- `created_at` and `updated_at` are standard in main entities
- Physical deletion is not considered for `Case` and `Evidence` in V1
- Files are stored in AWS S3 (not in PostgreSQL)
- Critical validations are performed in backend
- Sessions use JWT-based authentication

---

## 9. Development Phases

### Phase 1 — Base Infrastructure

**Objective:** Establish project foundation

**Deliverables:**
- NestJS monorepo
- Empty microservices
- PostgreSQL
- docker-compose
- RabbitMQ
- API Gateway

**Status:** Everything starting up

---

### Phase 2 — Security

**Objective:** Implement authentication and authorization

**Deliverables:**
- Keycloak
- JWT validation
- Roles
- Guards
- Permissions

**Note:** Without business logic yet

---

### Phase 3 — Core Services

**Objective:** Implement main microservices

**Implementation order:**
1. user-service
2. case-service
3. involved-service
4. task-service
5. evidence-service

---

### Phase 4 — Events

**Objective:** Establish event-based communication

**Deliverables:**
- RabbitMQ (full configuration)
- Publishers in each service
- Consumers in receiving services

---

### Phase 5 — Audit

**Objective:** Implement traceability

**Deliverables:**
- audit-service listening to events
- Critical event recording
- Audit query exposure

---

### Phase 6 — Media

**Objective:** Manage multimedia files

**Deliverables:**
- Media Service
- AWS S3 integration
- Uploads and multimedia management

---

### Phase 7 — Testing and Documentation

**Objective:** Ensure quality and documentation

**Deliverables:**
- Postman (API collections)
- Swagger (automatic documentation)
- Validations
- Error handling
- Permission validation

---

## 10. Version 1 Scope

**V1 includes:**
- Keycloak authentication
- Role-based authorization
- Case management
- Involved persons management
- Evidence management
- Basic chain of custody
- Task management
- Basic audit
- Multimedia (upload to S3)
- Web frontend

---

## 11. Version 1 Exclusions

**V1 does NOT include:**
- Artificial intelligence
- Biometric analysis
- Facial recognition
- Geolocation
- Advanced digital signature
- External integrations
- Mobile applications
- Real-time chat

---

## 12. Closed Decisions

- Authentication is managed with Keycloak
- Operational user profile is managed in a local table
- Involved person relationship type is defined in `Case_Involved_Person`
- Case team is defined in `Case_Team`
- Multimedia is managed with a generic `Media` table
- Custody is managed with `Chain_of_Custody`
- Cases and evidence are not physically deleted in V1 (logical deletion)
- Permissions are validated in backend and reflected in frontend
- Backend: NestJS + TypeScript
- Database: PostgreSQL (single instance with separate schemas)
- Event communication: RabbitMQ
- Storage: AWS S3
- Monorepo structure with defined architecture

