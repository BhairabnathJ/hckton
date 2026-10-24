# Requirements Document

## Introduction

This spec defines the requirements for producing the authoritative SideQuest
architecture document. The sole deliverable is a single planning artifact —
`/docs/architecture.md` — that documents the complete backend and sandbox system
for SideQuest, a platform where CS students complete tickets in simulated company
codebases using the real workflow (branch → PR → hidden tests → AI code review →
fix → pass → XP), unlocking a paid, first-come-first-serve job marketplace at
Level 6.

This spec is **planning and documentation only**. It produces no application code.
The resulting `/docs/architecture.md` is the canonical reference that all later
feature specs (`api-contract`, `sandbox-brightline`, `grader`, `core-api`,
`marketplace`, `injection-hook`) MUST conform to. The requirements below are derived
from the approved design document and frame the content, structure, and authority of
that artifact.

## Glossary

- **Architecture_Document**: The deliverable planning artifact at `/docs/architecture.md`.
- **Authoring_System**: The process and author responsible for producing the Architecture_Document from the approved design.
- **Component_Diagram**: A Mermaid diagram depicting the API modules, grader, Docker sandbox, GitHub, Bedrock, SQLite, and SSE hub, and the relationships between them.
- **ER_Diagram**: A Mermaid entity-relationship diagram describing the complete data model.
- **Sequence_Diagram**: A Mermaid sequence diagram depicting the ordered interactions for a specific flow.
- **State_Machine**: A Mermaid state diagram describing the lifecycle states and transitions of an entity.
- **Security_Model**: The section of the Architecture_Document describing hidden-test isolation, sandbox limits, secrets handling, and opt-in telemetry.
- **Mock_Inventory**: The section listing every mocked capability and its production replacement path.
- **Build_Plan**: The section listing feature specs in dependency order with inputs, outputs, dependencies, owner, and time estimate.
- **Risk_Register**: The section listing known risks and their fallbacks.
- **Later_Spec**: Any downstream feature spec that implements part of the system (`api-contract`, `sandbox-brightline`, `grader`, `core-api`, `marketplace`, `injection-hook`).
- **MOCK_Convention**: The convention that every mock code path is marked in source with a `// MOCK` comment.
- **Sandbox_Limits**: The enforced grader sandbox constraints: Docker `--network none`, 512 MB memory, 1 CPU, and a 60-second timeout.

## Requirements

### Requirement 1: Deliverable artifact and section structure

**User Story:** As a technical lead, I want the architecture captured in a single authoritative document with a fixed section structure, so that the whole team has one canonical reference to build against.

#### Acceptance Criteria

1. THE Authoring_System SHALL produce the Architecture_Document as a single Markdown file at the path `/docs/architecture.md`.
2. THE Architecture_Document SHALL contain exactly nine top-level sections, each marked as a top-level heading, in this order: system overview with component diagram, module boundaries and responsibilities, data model, sequence diagrams, state machines, security model, mocks and production replacements, build plan, and known risks and fallbacks.
3. IF the Architecture_Document is missing any of the nine required sections, contains a section not in the required list, or orders the sections differently from the specified order, THEN THE Authoring_System SHALL treat the document as incomplete and indicate which section is missing, extraneous, or out of order.
4. THE Authoring_System SHALL produce no application code, configuration files, or executable scripts as part of this spec, producing only the Architecture_Document.

### Requirement 2: System overview and component diagram

**User Story:** As an engineer joining the project, I want a system overview with a component diagram, so that I can understand how the parts of the system connect at a glance.

#### Acceptance Criteria

1. THE Architecture_Document SHALL include a system overview section that describes the Express + TypeScript API, the grader, and the live update transport, with each of these three components described in at least one sentence.
2. THE Architecture_Document SHALL include a Component_Diagram rendered as a Mermaid diagram that is enclosed in a fenced code block labeled with the Mermaid language identifier.
3. THE Component_Diagram SHALL depict all of the following components, each as a distinct labeled node: the API feature modules, the grader, the Docker sandbox, GitHub, Bedrock, SQLite, and the SSE hub.
4. THE Component_Diagram SHALL depict at least one connection between each named component and at least one other component, such that no named component appears without a connection.
5. THE Component_Diagram SHALL depict a read-or-write connection to the SQLite database originating only from the API component, with no other component having a connection to SQLite.

### Requirement 3: Module boundaries and responsibilities

**User Story:** As a module owner, I want each module's boundaries and responsibilities documented, so that ownership is clear and modules do not overlap.

#### Acceptance Criteria

1. THE Architecture_Document SHALL document module boundaries and responsibilities for each of the following nine modules: users, tickets, attempts, ai-personas, progression, telemetry, grader, marketplace, and events.
2. THE Architecture_Document SHALL state, for each of the nine documented modules, the responsibilities that the module owns and the responsibilities that the module explicitly does not own.
3. THE Architecture_Document SHALL document that each responsibility listed as owned by one module is not listed as owned by any other module.
4. THE Architecture_Document SHALL describe the dependency direction between the nine modules as a directed acyclic graph that contains no cyclic dependency path.
5. IF a documented module has no dependency on any other module, THEN THE Architecture_Document SHALL state that the module has no outgoing module dependencies.

### Requirement 4: Data model as an ER diagram

**User Story:** As a backend engineer, I want the complete data model as an ER diagram, so that I can implement the Prisma schema consistently with the design.

#### Acceptance Criteria

1. THE Architecture_Document SHALL include an ER_Diagram rendered as a Mermaid entity-relationship diagram.
2. THE ER_Diagram SHALL include exactly the entities User, Ticket, Attempt, GradeRun, Review, Persona, Job, Submission, and TelemetryEvent, with no additional entities.
3. THE ER_Diagram SHALL define for each entity at least one attribute designated as its primary-key identifier.
4. THE ER_Diagram SHALL define, for every relationship between two included entities, a cardinality of one-to-one, one-to-many, or many-to-many.
5. THE ER_Diagram SHALL mark the hidden-test reference field with a server-only annotation indicating it is never exposed to the student-facing repository or client.

### Requirement 5: Sequence diagrams

**User Story:** As an engineer implementing a flow, I want sequence diagrams for the key flows, so that I can see the ordered interactions between components.

#### Acceptance Criteria

1. THE Architecture_Document SHALL include a Sequence_Diagram rendered as a Mermaid diagram for the flow start ticket, PR, grade, review, and XP award, where the diagram depicts each of these 5 steps in ascending chronological order with at least one labeled interaction per step.
2. THE Architecture_Document SHALL include a Sequence_Diagram rendered as a Mermaid diagram for the flow job drop, claim, submit, accept, and mock escrow release, where the diagram depicts each of these 5 steps in ascending chronological order with at least one labeled interaction per step.
3. THE Architecture_Document SHALL include a Sequence_Diagram rendered as a Mermaid diagram for the flow bug-injection hook creating a new ticket, where the diagram depicts the ordered interactions from hook trigger to new-ticket creation with at least one labeled interaction per step.
4. THE Architecture_Document SHALL label each participant in every Sequence_Diagram with a name that matches a component named in the Architecture_Document.
5. IF a Sequence_Diagram contains Mermaid syntax that does not render as a diagram, THEN THE Architecture_Document SHALL be considered non-compliant, with the specific diagram identified as the failing element.

### Requirement 6: State machines

**User Story:** As an engineer implementing the attempt and job lifecycles, I want state machines for each, so that I implement only valid states and transitions.

#### Acceptance Criteria

1. THE Architecture_Document SHALL include a State_Machine for the Attempt entity rendered as a Mermaid diagram.
2. THE Architecture_Document SHALL include a State_Machine for the Job entity rendered as a Mermaid diagram.
3. THE Attempt State_Machine SHALL include the states in_progress, grading, changes_requested, passed, and abandoned.
4. THE Job State_Machine SHALL include the states dropped, claimed, submitted, and accepted.
5. THE Attempt State_Machine SHALL define each permitted transition between the states in_progress, grading, changes_requested, passed, and abandoned as a directed edge labeled with the triggering event, and SHALL mark in_progress as the initial state and passed and abandoned as terminal states.
6. THE Job State_Machine SHALL define each permitted transition between the states dropped, claimed, submitted, and accepted as a directed edge labeled with the triggering event, and SHALL mark dropped as the initial state and accepted as the terminal state.
7. WHERE a state in either State_Machine permits no outgoing transition to another defined state, THE Architecture_Document SHALL identify that state as terminal.

### Requirement 7: Security model

**User Story:** As a security reviewer, I want a documented security model, so that I can confirm hidden tests, sandbox limits, secrets, and telemetry are handled safely.

#### Acceptance Criteria

1. THE Security_Model SHALL describe hidden-test isolation, including that hidden tests and ticket definitions are server-only and that no API response includes hidden-test or ticket-definition contents.
2. THE Security_Model SHALL document the Sandbox_Limits as Docker `--network none`, a 512 MB memory limit, 1 CPU, and a 60-second execution timeout, and SHALL state that a run exceeding the timeout is terminated and reported as failed.
3. THE Security_Model SHALL document that the GitHub personal access token and Bedrock credentials are read from environment variables and are never logged or returned in responses, including error responses.
4. IF the GitHub personal access token or Bedrock credentials are missing at startup, THEN THE Security_Model SHALL document that the system indicates the error without exposing any credential value.
5. THE Security_Model SHALL document that telemetry events are recorded when the user has opted in and are not recorded when the user has not opted in or has opted out.

### Requirement 8: Mock inventory and production replacements

**User Story:** As a maintainer planning the path to production, I want every mock listed with its replacement, so that I know exactly what to swap and where.

#### Acceptance Criteria

1. THE Mock_Inventory SHALL list exactly three mocks: the X-Demo-User authentication mock, the Stripe escrow mock, and the payouts mock.
2. THE Mock_Inventory SHALL, for each of the three listed mocks, record its source location as a file path and the name of the component or module that contains the mock code path.
3. THE Mock_Inventory SHALL, for each of the three listed mocks, describe the production replacement as the named production mechanism that supersedes the mock and the observable behavior the replacement provides.
4. THE Mock_Inventory SHALL state the MOCK_Convention that every mock code path is marked in source with a `// MOCK` comment.
5. IF a listed mock has no documented production replacement, THEN THE Mock_Inventory SHALL mark that mock with an explicit indicator that its replacement is undefined.

### Requirement 9: Build plan in dependency order

**User Story:** As a team lead coordinating an 8-hour hackathon, I want a build plan ordered by dependency, so that four people can work in parallel without blocking each other.

#### Acceptance Criteria

1. THE Build_Plan SHALL list exactly the six feature specs api-contract, sandbox-brightline, grader, core-api, marketplace, and injection-hook in dependency order.
2. THE Build_Plan SHALL state, for each of the six listed specs, all five of the following attributes: inputs, outputs, dependencies, owner, and time estimate.
3. THE Build_Plan SHALL express each per-spec time estimate as a duration in hours, where the sum of all six estimates does not exceed 8 hours per owner.
4. THE Build_Plan SHALL assign each of the six listed specs exactly one owner, identified as one of Person A, Person B, Person C, or Person D.
5. THE Build_Plan SHALL order the six specs such that each spec appears after every spec listed in its dependencies attribute.
6. IF any listed spec declares a dependency on a spec that is not one of the six listed specs, THEN THE Build_Plan SHALL present an indication identifying the unresolved dependency.

### Requirement 10: Known risks and fallbacks

**User Story:** As a team lead, I want known risks paired with fallbacks, so that the demo can still succeed when something fails.

#### Acceptance Criteria

1. THE Risk_Register SHALL list each known risk as an entry containing a risk description, a corresponding fallback action, and a trigger condition that indicates when the fallback applies.
2. IF a Risk_Register entry omits either its fallback action or its trigger condition, THEN THE Risk_Register SHALL be considered incomplete and the missing field SHALL be indicated.
3. THE Risk_Register SHALL include the risk that Docker is unavailable together with the fallback of a local subprocess runner behind the same grader interface.
4. THE Risk_Register SHALL contain at least 3 risk entries.

### Requirement 11: Document authority and downstream conformance

**User Story:** As a contributor to a later spec, I want the architecture document declared authoritative, so that I know my spec must conform to it and how deviations are handled.

#### Acceptance Criteria

1. THE Architecture_Document SHALL declare itself the authoritative reference for the SideQuest backend and sandbox system.
2. THE Architecture_Document SHALL state that every Later_Spec must conform to each of the following elements it defines: module boundaries, data model, interfaces, state machines, security model, and build plan.
3. IF a Later_Spec conflicts with any element the Architecture_Document defines, THEN the Architecture_Document SHALL require that the Architecture_Document be updated to reflect the change before the Later_Spec is approved.
4. WHERE a Later_Spec deviation has been approved, THE Architecture_Document SHALL require that the updated Architecture_Document identify the superseded element and the date the change took effect.
