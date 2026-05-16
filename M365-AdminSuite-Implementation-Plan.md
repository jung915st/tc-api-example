# M365 Domain Admin Suite — Implementation Plan

**Version:** 1.0.0 | **Date:** 2026-03-10
**Stack:** Java 21 + Spring Boot 3 + Vue 3 + Microsoft Graph SDK 6 + Docker
**IDE:** VS Code Insiders + Claude Code
**Source Reference:** GAS-ADMIN AdminSuite v2.2.1

---

## 1. Executive Summary

This plan migrates the existing Google Apps Script (GAS) AdminSuite — a Google Workspace domain administration dashboard — into a standalone Java/Vue web application targeting **Microsoft 365 / Entra ID** tenants. The new system provides equivalent admin capabilities (Classroom → Teams Education, Groups, Directory, Drive → OneDrive/SharePoint, Email → Outlook) via the **Microsoft Graph API**, packaged as a Docker deployment.

Development will proceed using **Claude Code** within VS Code Insiders as the primary AI-assisted coding agent.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                       │
│                                                          │
│  ┌──────────────────────┐   ┌────────────────────────┐  │
│  │   Vue 3 SPA (Nginx)  │   │  Spring Boot 3 API     │  │
│  │                      │   │                         │  │
│  │  - Vue Router        │──▶│  - REST Controllers     │  │
│  │  - Pinia Store       │   │  - Service Layer        │  │
│  │  - Axios HTTP Client │   │  - Microsoft Graph SDK  │  │
│  │  - Bootstrap 5 / UI  │   │  - Spring Security      │  │
│  │                      │   │  - Spring Data JPA      │  │
│  │  Port: 80            │   │  - H2 / PostgreSQL      │  │
│  └──────────────────────┘   │                         │  │
│                              │  Port: 8080             │  │
│                              └───────────┬────────────┘  │
│                                          │               │
│  ┌───────────────────────┐               │               │
│  │  PostgreSQL (optional) │               │               │
│  │  Port: 5432           │◀──────────────┘               │
│  └───────────────────────┘                               │
└─────────────────────────────────────────────────────────┘
                        │
                        ▼
          ┌──────────────────────────┐
          │  Microsoft Graph API     │
          │  graph.microsoft.com     │
          │                          │
          │  - Entra ID (Users/Groups)│
          │  - Teams Education API   │
          │  - OneDrive / SharePoint │
          │  - Outlook Mail          │
          └──────────────────────────┘
```

### Key Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend Framework | Spring Boot 3.3+ | Spring MVC preference, Graph SDK official support |
| Auth | MSAL + Spring Security OAuth2 | Entra ID integration, token refresh built-in |
| Frontend Framework | Vue 3 + Vite | User preference, SPA replaces GAS `index.html` |
| Database | H2 (dev) / PostgreSQL (prod) | Replaces GAS Spreadsheet-based logging |
| Batch Processing | Graph JSON Batch (`/$batch`) | Replaces GAS multipart/mixed Classroom batches |
| File Upload Parsing | Apache Commons CSV | Replaces GAS `Utilities.parseCsv()` |
| Deployment | Docker Compose | Multi-container: API + SPA + DB |

---

## 3. Feature Mapping: GAS → M365

### 3.1 Classroom → Teams Education

| GAS Function | Spring Service Method | Graph Endpoint |
|---|---|---|
| `createClassroomCourse()` | `EducationService.createClass()` | `POST /education/classes` |
| `listCourses()` | `EducationService.listClasses()` | `GET /education/classes` |
| `listArchivedCourses()` | `EducationService.listArchivedClasses()` | `GET /education/classes?$filter=externalSource eq 'manual'` with archived flag |
| `deleteClassroomCourse()` | `EducationService.deleteClass()` | `DELETE /education/classes/{id}` |
| `archiveClassroomCourses()` | `EducationService.archiveClasses()` | `PATCH /groups/{id}` (archive Teams group) |
| `addStudentsToCourse()` | `EducationService.addMembers()` | `POST /education/classes/{id}/members/$ref` |
| `getEnrolledStudentEmails()` | `EducationService.getMembers()` | `GET /education/classes/{id}/members` |
| `applyEnrollmentChanges()` | `EducationService.syncEnrollment()` | POST members + DELETE members |
| `processBatchCourseUpload()` | `EducationService.batchCreateClasses()` | `POST /$batch` with create payloads |
| `getCourseBatchTemplate()` | `TemplateService.getClassTemplate()` | Local CSV generation |

**Important Notes:**
- Microsoft Education API uses `educationClass` resources, not "courses"
- Class creation also creates a backing Microsoft 365 Group and optionally a Teams team
- Teacher assignment uses `POST /education/classes/{id}/teachers/$ref` (separate from members)
- Enrollment codes don't exist; Microsoft uses join links or direct member adds
- The Education assignment/grading API is still partially in beta

### 3.2 Groups & Members → Entra ID Groups

| GAS Function | Spring Service Method | Graph Endpoint |
|---|---|---|
| `getWorkspaceGroups()` | `GroupService.listGroups()` | `GET /groups?$filter=groupTypes/any(...)` |
| `processBatchGroupUpload()` | `GroupService.batchCreateGroups()` | `POST /$batch` with `POST /groups` items |
| `assignMembersToGroups()` | `GroupService.assignMembers()` | `POST /groups/{id}/members/$ref` |
| `getGroupBatchTemplate()` | `TemplateService.getGroupTemplate()` | Local CSV generation |

**Key Differences:**
- Microsoft groups have types: Microsoft 365 groups, Security groups, Mail-enabled security groups, Distribution groups
- Group creation requires `mailNickname` (unique, no spaces)
- Member roles in M365 groups: Owner vs Member (no "MANAGER" equivalent — use Owner)
- Rate limit: ~20 requests per batch, throttled per tenant

### 3.3 User & Directory → Entra ID Users + Administrative Units

| GAS Function | Spring Service Method | Graph Endpoint |
|---|---|---|
| `getDomainOUs()` | `DirectoryService.listAdminUnits()` | `GET /directory/administrativeUnits` |
| `getFilteredUsers()` | `DirectoryService.listUsers()` | `GET /users?$filter=...&$select=...` |
| `moveUsersToOU()` | `DirectoryService.moveUsersToUnit()` | `POST /directory/administrativeUnits/{id}/members/$ref` |
| `processUserSuspension()` | `DirectoryService.disableUsers()` | `PATCH /users/{id}` → `accountEnabled: false` |

**Key Differences:**
- Entra ID uses "Administrative Units" (AU) instead of OUs; AUs are flat, not hierarchical
- "Suspended" in Google = `accountEnabled: false` in Entra ID
- Last login: Use `signInActivity.lastSignInDateTime` (requires `AuditLog.Read.All` + P1 license)
- `$filter` on `signInActivity` requires Azure AD Premium P1 or P2
- User deletion: `DELETE /users/{id}` (soft-delete to recycle bin, 30-day recovery)

### 3.4 Lifecycle Automation → Scheduled Tasks

| GAS Function | Replacement |
|---|---|
| `installTrigger()` | Spring `@Scheduled(cron = "0 0 1 * * ?")` or Docker cron |
| `checkDeletionQueue()` | `LifecycleService.processDeletionQueue()` — query DB for due accounts |
| `syncSuspendedToQueue()` | `LifecycleService.syncDisabledUsers()` — `GET /users?$filter=accountEnabled eq false` |

### 3.5 Drive Audit → OneDrive / SharePoint

| GAS Function | Spring Service Method | Graph Endpoint |
|---|---|---|
| `findOutdatedFiles()` | `DriveService.findOutdatedFiles()` | `GET /drives/{id}/root/search(q='*')` with `$filter` and `$orderby` |
| `manageFiles('delete')` | `DriveService.deleteFiles()` | `DELETE /drives/{id}/items/{item-id}` |
| `manageFiles('archive')` | `DriveService.archiveFiles()` | `PATCH /drives/{id}/items/{item-id}` (rename) |

**Key Differences:**
- OneDrive = personal drive; SharePoint = shared drives
- "All Drives" query requires iterating sites: `GET /sites?search=*` then each site's drive
- File size = `size` property (bytes); no `quotaBytesUsed` equivalent
- Permanent delete: `DELETE /drives/{id}/items/{item-id}` (moves to recycle bin first)
- Sort: `$orderby=size desc,lastModifiedDateTime asc`

### 3.6 Email → Outlook via Graph

| GAS Function | Spring Service Method | Graph Endpoint |
|---|---|---|
| `sendCustomEmailBatch()` | `MailService.sendBatchEmail()` | `POST /users/{sender-id}/sendMail` |

**Key Differences:**
- Application permission `Mail.Send` allows sending as any user
- Delegated permission sends as the signed-in admin
- HTML body goes in `message.body.content` with `contentType: "html"`
- Template variables (`{name}`, `{email}`) handled server-side before send (same pattern)

### 3.7 Logging → Database Tables

| GAS Sheet | DB Table | Fields |
|---|---|---|
| `Classroom_Courses` | `education_classes` | id, class_id, name, section, owner_email, teacher_email, created_at |
| `Classroom_Logs` | `system_logs` | id, timestamp, action, target, status, detail, version |
| `Action_Logs` | `lifecycle_actions` | id, timestamp, user_email, status, scheduled_deletion_date |
| `Group_Audit_Logs` | `group_audit_logs` | id, timestamp, job_id, action, stage, group_email, member_email, role, status, status_code, message, meta |
| `Email_Logs` | `email_logs` | id, timestamp, recipient, subject, status, sender |

---

## 4. Microsoft Entra ID App Registration

### 4.1 Required API Permissions

Register a multi-tenant or single-tenant app in the **Microsoft Entra admin center** (`entra.microsoft.com`).

**Application Permissions (daemon / admin-consented):**

| Permission | Scope | Maps to GAS Scope |
|---|---|---|
| `User.ReadWrite.All` | Read/write all user profiles | `admin.directory.user` |
| `Group.ReadWrite.All` | Create/manage groups + members | `admin.directory.group` + `admin.directory.group.member` |
| `Directory.ReadWrite.All` | Admin units, org structure | `admin.directory.orgunit` |
| `EduRoster.ReadWrite.All` | Education classes + rosters | `classroom.courses` + `classroom.rosters` |
| `EduAssignments.ReadWrite.All` | Education assignments (if needed) | `classroom.courses` (partial) |
| `Mail.Send` | Send mail as any user | `gmail.send` |
| `Files.ReadWrite.All` | OneDrive/SharePoint file access | `drive` |
| `Sites.ReadWrite.All` | SharePoint site-level access | `drive` (shared drives) |
| `AuditLog.Read.All` | Sign-in activity for last-login filter | (no GAS equivalent — needed for login-date filters) |

**Delegated Permissions (for admin user sign-in flow):**

| Permission | Purpose |
|---|---|
| `User.Read` | Read signed-in user profile |
| `openid`, `profile`, `offline_access` | Standard OIDC + refresh tokens |

### 4.2 App Registration Steps

1. Go to `entra.microsoft.com` → **App registrations** → **New registration**
2. Name: `M365 Admin Suite`
3. Redirect URI: `http://localhost:8080/login/oauth2/code/` (Web)
4. Note the **Application (client) ID** and **Directory (tenant) ID**
5. Create a **Client Secret** (or certificate for production)
6. Under **API permissions** → Add all permissions listed above
7. Click **Grant admin consent** for your tenant

---

## 5. Project Structure

```
m365-admin-suite/
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
│
├── backend/
│   ├── Dockerfile
│   ├── pom.xml
│   ├── src/main/java/com/admin/m365suite/
│   │   ├── M365AdminSuiteApplication.java
│   │   │
│   │   ├── config/
│   │   │   ├── GraphClientConfig.java          # GraphServiceClient bean
│   │   │   ├── SecurityConfig.java             # Spring Security + OAuth2
│   │   │   ├── CorsConfig.java                 # CORS for Vue dev server
│   │   │   └── SchedulingConfig.java           # @EnableScheduling
│   │   │
│   │   ├── controller/
│   │   │   ├── EducationController.java        # /api/education/**
│   │   │   ├── GroupController.java            # /api/groups/**
│   │   │   ├── DirectoryController.java        # /api/directory/**
│   │   │   ├── DriveController.java            # /api/drive/**
│   │   │   ├── MailController.java             # /api/mail/**
│   │   │   ├── LifecycleController.java        # /api/lifecycle/**
│   │   │   ├── BatchUploadController.java      # /api/batch/**
│   │   │   └── SystemController.java           # /api/system/** (health, version)
│   │   │
│   │   ├── service/
│   │   │   ├── EducationService.java
│   │   │   ├── GroupService.java
│   │   │   ├── DirectoryService.java
│   │   │   ├── DriveService.java
│   │   │   ├── MailService.java
│   │   │   ├── LifecycleService.java
│   │   │   ├── BatchParsingService.java        # CSV/TSV parsing + validation
│   │   │   ├── GraphBatchService.java          # JSON batch helper ($batch)
│   │   │   ├── AuditLogService.java            # Centralized DB logging
│   │   │   └── TemplateService.java            # CSV template generation
│   │   │
│   │   ├── model/
│   │   │   ├── entity/                         # JPA entities
│   │   │   │   ├── SystemLog.java
│   │   │   │   ├── EducationClassRecord.java
│   │   │   │   ├── LifecycleAction.java
│   │   │   │   ├── GroupAuditLog.java
│   │   │   │   └── EmailLog.java
│   │   │   │
│   │   │   ├── dto/                            # Request/Response DTOs
│   │   │   │   ├── CreateClassRequest.java
│   │   │   │   ├── BatchUploadResult.java
│   │   │   │   ├── AssignMembersRequest.java
│   │   │   │   ├── FilterUsersRequest.java
│   │   │   │   ├── SendEmailRequest.java
│   │   │   │   └── ...
│   │   │   │
│   │   │   └── enums/
│   │   │       ├── GroupMemberRole.java         # OWNER, MEMBER
│   │   │       ├── BatchStage.java              # CREATE_CLASS, ADD_TEACHER, etc.
│   │   │       └── AuditAction.java             # Enum of all loggable actions
│   │   │
│   │   ├── repository/
│   │   │   ├── SystemLogRepository.java
│   │   │   ├── EducationClassRepository.java
│   │   │   ├── LifecycleActionRepository.java
│   │   │   ├── GroupAuditLogRepository.java
│   │   │   └── EmailLogRepository.java
│   │   │
│   │   ├── batch/
│   │   │   ├── HeaderAliasResolver.java         # Maps CSV header aliases
│   │   │   ├── ClassBatchProcessor.java         # 2-phase: create + assign teacher
│   │   │   ├── GroupBatchProcessor.java
│   │   │   └── BatchRowValidator.java
│   │   │
│   │   └── util/
│   │       ├── GraphErrorExtractor.java         # Parse Graph API errors
│   │       ├── CsvTemplateGenerator.java
│   │       └── TimeZoneHelper.java              # UTC+8 formatting
│   │
│   ├── src/main/resources/
│   │   ├── application.yml
│   │   ├── application-dev.yml
│   │   ├── application-prod.yml
│   │   └── db/migration/                        # Flyway migrations
│   │       ├── V1__create_system_logs.sql
│   │       ├── V2__create_education_classes.sql
│   │       ├── V3__create_lifecycle_actions.sql
│   │       ├── V4__create_group_audit_logs.sql
│   │       └── V5__create_email_logs.sql
│   │
│   └── src/test/java/com/admin/m365suite/
│       ├── service/
│       │   ├── BatchParsingServiceTest.java     # Maps to GAS test suite
│       │   ├── HeaderAliasResolverTest.java
│       │   ├── GroupBatchProcessorTest.java
│       │   └── GraphBatchServiceTest.java
│       └── controller/
│           └── ...
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── router/
│   │   │   └── index.js                         # Tab routes
│   │   ├── stores/                              # Pinia
│   │   │   ├── auth.js
│   │   │   ├── education.js
│   │   │   ├── groups.js
│   │   │   ├── directory.js
│   │   │   ├── drive.js
│   │   │   └── mail.js
│   │   ├── api/
│   │   │   ├── client.js                        # Axios instance + interceptors
│   │   │   ├── education.js
│   │   │   ├── groups.js
│   │   │   ├── directory.js
│   │   │   ├── drive.js
│   │   │   └── mail.js
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── AppHeader.vue
│   │   │   │   ├── AppSidebar.vue               # Tab navigation
│   │   │   │   └── LoadingOverlay.vue
│   │   │   ├── education/
│   │   │   │   ├── ClassList.vue
│   │   │   │   ├── CreateClassForm.vue
│   │   │   │   ├── BatchUploadCard.vue
│   │   │   │   ├── EnrollmentPanel.vue
│   │   │   │   └── ArchivedClassList.vue
│   │   │   ├── groups/
│   │   │   │   ├── GroupList.vue
│   │   │   │   ├── BatchGroupUpload.vue
│   │   │   │   └── MemberAssignment.vue
│   │   │   ├── directory/
│   │   │   │   ├── UserFilter.vue
│   │   │   │   ├── UserTable.vue
│   │   │   │   └── BulkActions.vue
│   │   │   ├── drive/
│   │   │   │   ├── AuditFilter.vue
│   │   │   │   └── FileTable.vue
│   │   │   ├── mail/
│   │   │   │   ├── RecipientSelector.vue
│   │   │   │   └── EmailComposer.vue
│   │   │   └── shared/
│   │   │       ├── OuSelector.vue
│   │   │       ├── UserChecklist.vue
│   │   │       ├── BatchResultDisplay.vue
│   │   │       ├── ConfirmDialog.vue
│   │   │       └── DataTable.vue
│   │   └── views/
│   │       ├── EducationView.vue                # Tab 1: Classroom → Education
│   │       ├── DirectoryView.vue                # Tab 2: User Lifecycle
│   │       ├── GroupsView.vue                   # Tab 3: Groups & Members
│   │       ├── DriveView.vue                    # Tab 4: Drive Audit
│   │       └── MailView.vue                     # Tab 5: Email Notify
│   │
│   └── public/
│       └── favicon.ico
│
└── docs/
    ├── CLAUDE_CODE_GUIDE.md                     # Claude Code workflow instructions
    └── API_MAPPING.md                           # Full GAS → Graph endpoint map
```

---

## 6. Technology Stack & Dependencies

### 6.1 Backend (pom.xml)

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
</parent>

<properties>
    <java.version>21</java.version>
    <microsoft-graph.version>6.29.0</microsoft-graph.version>
    <azure-identity.version>1.14.2</azure-identity.version>
</properties>

<dependencies>
    <!-- Spring -->
    <dependency>spring-boot-starter-web</dependency>
    <dependency>spring-boot-starter-security</dependency>
    <dependency>spring-boot-starter-oauth2-client</dependency>
    <dependency>spring-boot-starter-data-jpa</dependency>
    <dependency>spring-boot-starter-validation</dependency>

    <!-- Microsoft Graph -->
    <dependency>com.microsoft.graph:microsoft-graph:${microsoft-graph.version}</dependency>
    <dependency>com.azure:azure-identity:${azure-identity.version}</dependency>

    <!-- Database -->
    <dependency>com.h2database:h2 (runtime, dev)</dependency>
    <dependency>org.postgresql:postgresql (runtime, prod)</dependency>
    <dependency>org.flywaydb:flyway-core</dependency>

    <!-- CSV Parsing -->
    <dependency>org.apache.commons:commons-csv:1.11.0</dependency>

    <!-- Utility -->
    <dependency>org.projectlombok:lombok</dependency>
    <dependency>org.mapstruct:mapstruct</dependency>

    <!-- Test -->
    <dependency>spring-boot-starter-test</dependency>
    <dependency>org.mockito:mockito-core</dependency>
</dependencies>
```

### 6.2 Frontend (package.json)

```json
{
  "dependencies": {
    "vue": "^3.5",
    "vue-router": "^4.4",
    "pinia": "^2.2",
    "axios": "^1.7",
    "bootstrap": "^5.3.0",
    "bootstrap-icons": "^1.11"
  },
  "devDependencies": {
    "vite": "^6.0",
    "@vitejs/plugin-vue": "^5.2",
    "vitest": "^2.1",
    "@vue/test-utils": "^2.4"
  }
}
```

---

## 7. Configuration

### 7.1 application.yml

```yaml
spring:
  application:
    name: m365-admin-suite
  security:
    oauth2:
      client:
        registration:
          azure:
            client-id: ${AZURE_CLIENT_ID}
            client-secret: ${AZURE_CLIENT_SECRET}
            scope: openid,profile,offline_access,User.Read
            redirect-uri: "{baseUrl}/login/oauth2/code/{registrationId}"
        provider:
          azure:
            issuer-uri: https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0

  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:${DB_PORT:5432}/${DB_NAME:m365admin}
    username: ${DB_USER:admin}
    password: ${DB_PASS:admin}

  flyway:
    enabled: true

app:
  version: 1.0.0
  timezone: Asia/Taipei
  azure:
    tenant-id: ${AZURE_TENANT_ID}
    client-id: ${AZURE_CLIENT_ID}
    client-secret: ${AZURE_CLIENT_SECRET}
  batch:
    max-rows: 100
    max-graph-batch-size: 20
  lifecycle:
    deletion-delay-months: 3
    cron: "0 0 1 * * ?"
  log:
    max-system-logs: 2000
    max-audit-logs: 5000
```

### 7.2 Docker Environment (.env)

```env
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-client-id
AZURE_CLIENT_SECRET=your-client-secret
DB_HOST=db
DB_PORT=5432
DB_NAME=m365admin
DB_USER=admin
DB_PASS=changeme
APP_PORT=8080
```

---

## 8. Docker Configuration

### 8.1 docker-compose.yml

```yaml
version: "3.9"

services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASS}
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      - SPRING_PROFILES_ACTIVE=prod
      - AZURE_TENANT_ID=${AZURE_TENANT_ID}
      - AZURE_CLIENT_ID=${AZURE_CLIENT_ID}
      - AZURE_CLIENT_SECRET=${AZURE_CLIENT_SECRET}
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=${DB_NAME}
      - DB_USER=${DB_USER}
      - DB_PASS=${DB_PASS}
    ports:
      - "8080:8080"
    depends_on:
      db:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        VITE_API_BASE_URL: http://localhost:8080
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  pgdata:
```

### 8.2 Backend Dockerfile

```dockerfile
FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /app
COPY pom.xml .
COPY mvnw .
COPY .mvn .mvn
RUN ./mvnw dependency:resolve
COPY src src
RUN ./mvnw package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 8.3 Frontend Dockerfile

```dockerfile
FROM node:20-alpine AS build
ARG VITE_API_BASE_URL=http://localhost:8080
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN VITE_API_BASE_URL=$VITE_API_BASE_URL npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## 9. Implementation Phases

### Phase 0: Project Scaffolding (Day 1)

**Goal:** Skeleton project compiles, Docker runs, health endpoint responds.

| # | Task | Claude Code Command |
|---|---|---|
| 0.1 | Create project root with backend/frontend/docs dirs | `mkdir -p m365-admin-suite/{backend,frontend,docs}` |
| 0.2 | Generate Spring Boot project (Spring Initializr or manual) | "Initialize a Spring Boot 3.3 project with Web, Security, JPA, Flyway, Validation, OAuth2 Client, Lombok" |
| 0.3 | Add Microsoft Graph SDK + Azure Identity deps to pom.xml | "Add microsoft-graph 6.29.0 and azure-identity 1.14.2 to pom.xml" |
| 0.4 | Create `GraphClientConfig.java` — `ClientSecretCredential` → `GraphServiceClient` bean | "Create GraphServiceClient Spring bean using ClientSecretCredential" |
| 0.5 | Create `SecurityConfig.java` — permit `/api/**` for now, OAuth2 login | "Configure Spring Security to permit API paths, enable OAuth2 login for Azure" |
| 0.6 | Create `SystemController.java` — `GET /api/system/health` + `GET /api/system/version` | "Create health and version REST endpoints" |
| 0.7 | Scaffold Vue 3 project with Vite | `npm create vue@latest frontend` |
| 0.8 | Add Bootstrap 5, Bootstrap Icons, Axios, Pinia to Vue project | "Add bootstrap 5, bootstrap-icons, axios, pinia to the Vue project" |
| 0.9 | Create `docker-compose.yml`, backend `Dockerfile`, frontend `Dockerfile` | "Create Docker Compose with PostgreSQL, Spring Boot backend, Vue/Nginx frontend" |
| 0.10 | First `docker compose up --build` — verify all 3 containers start | Manual verification |

### Phase 1: Directory & Users (Days 2–3)

**Goal:** List admin units, filter users, disable/enable, move between units.

| # | Task | Details |
|---|---|---|
| 1.1 | `DirectoryService.listAdminUnits()` | `GET /directory/administrativeUnits` → return list of AU names/IDs |
| 1.2 | `DirectoryService.listUsers(filter)` | `GET /users?$filter=...&$select=displayName,mail,accountEnabled,signInActivity,id&$top=500` with pagination |
| 1.3 | `DirectoryService.disableUsers(emails)` | `PATCH /users/{id}` with `{ accountEnabled: false }` in loop |
| 1.4 | `DirectoryService.moveUsersToUnit(emails, unitId)` | `POST /directory/administrativeUnits/{id}/members/$ref` |
| 1.5 | Flyway migration: `system_logs` + `lifecycle_actions` tables | SQL DDL |
| 1.6 | `AuditLogService` — centralized log-to-DB (replaces `logSystemAction_()`) | Insert into `system_logs` table |
| 1.7 | `DirectoryController` — REST endpoints wiring | `/api/directory/admin-units`, `/api/directory/users`, `/api/directory/users/disable`, `/api/directory/users/move` |
| 1.8 | Vue: `DirectoryView.vue` + `UserFilter.vue` + `UserTable.vue` + `BulkActions.vue` | Port Tab 2 (User Lifecycle) UI |
| 1.9 | Vue: `OuSelector.vue` shared component (reused by all tabs) | Port `initOUs()` centralized loader |
| 1.10 | Unit tests: `DirectoryServiceTest` with mocked GraphServiceClient | Test filter logic, AU mapping |

### Phase 2: Groups & Members (Days 4–5)

**Goal:** List groups, batch create, assign members with role control.

| # | Task | Details |
|---|---|---|
| 2.1 | `GroupService.listGroups()` | `GET /groups?$select=id,displayName,mail,description,membershipRule&$top=200` with pagination |
| 2.2 | `GroupService.createGroup(dto)` | `POST /groups` with M365 group body |
| 2.3 | `GroupBatchProcessor` — CSV/TSV parse, validate, dedupe, create | Port `processBatchGroupUpload()` logic |
| 2.4 | `GroupService.assignMembers(groupIds, userIds, role)` | Loop `POST /groups/{id}/members/$ref` with retry (3 attempts, backoff) |
| 2.5 | `HeaderAliasResolver` — generic alias mapping (reused by class + group) | Port `COURSE_BATCH_HEADER_ALIAS_LOOKUP` and `GROUP_BATCH_HEADER_ALIAS_LOOKUP` |
| 2.6 | `BatchParsingService` — CSV/TSV detection, row parsing, validation | Port `detectBatchDelimiter_()`, `parseDelimitedRows_()`, row validators |
| 2.7 | Flyway migration: `group_audit_logs` table | SQL DDL |
| 2.8 | `GroupController` — REST endpoints | `/api/groups`, `/api/groups/batch`, `/api/groups/members/assign` |
| 2.9 | Vue: `GroupsView.vue` + `GroupList.vue` + `BatchGroupUpload.vue` + `MemberAssignment.vue` | Port Tab 3 |
| 2.10 | Unit tests: `BatchParsingServiceTest`, `HeaderAliasResolverTest`, `GroupBatchProcessorTest` | Port GAS test suite tests |

### Phase 3: Education / Teams Classes (Days 6–8)

**Goal:** Create/list/archive/delete education classes, enroll students, batch upload.

| # | Task | Details |
|---|---|---|
| 3.1 | `EducationService.listClasses()` | `GET /education/classes?$select=id,displayName,externalId,description,mailNickname` |
| 3.2 | `EducationService.createClass(dto)` | `POST /education/classes` — requires `displayName`, `mailNickname`, `externalId` |
| 3.3 | `EducationService.deleteClass(id)` | `DELETE /education/classes/{id}` |
| 3.4 | `EducationService.archiveClasses(ids)` | Archive underlying Group: `PATCH /groups/{id}` or `POST /teams/{id}/archive` |
| 3.5 | `EducationService.addMembers(classId, emails)` | `POST /education/classes/{id}/members/$ref` for students |
| 3.6 | `EducationService.addTeacher(classId, email)` | `POST /education/classes/{id}/teachers/$ref` |
| 3.7 | `EducationService.getMembers(classId)` | `GET /education/classes/{id}/members` |
| 3.8 | `EducationService.syncEnrollment(classId, toAdd, toRemove)` | Port `applyEnrollmentChanges()` |
| 3.9 | `ClassBatchProcessor` — CSV upload → batch create + teacher assign | Port `processBatchCourseUpload()` two-phase pattern |
| 3.10 | `GraphBatchService` — generic JSON batch helper | Build `POST /$batch` with up to 20 requests per call, chunk larger sets |
| 3.11 | Flyway migration: `education_classes` table | SQL DDL |
| 3.12 | `EducationController` — REST endpoints | `/api/education/classes`, `/api/education/classes/batch`, `/api/education/classes/{id}/members` |
| 3.13 | Vue: `EducationView.vue` + all education components | Port Tab 1 (Classroom Manager) |
| 3.14 | Vue: `UserChecklist.vue` shared component (with pre-check for enrolled) | Port `loadStudentsFromOu()` + `enrolledEmailsCache_` pattern |
| 3.15 | Unit tests: `ClassBatchProcessorTest`, `GraphBatchServiceTest` | Port batch test scenarios |

### Phase 4: Drive Audit (Days 9–10)

**Goal:** Find large/old files across OneDrive + SharePoint, batch delete/archive.

| # | Task | Details |
|---|---|---|
| 4.1 | `DriveService.findOutdatedFiles(beforeDate)` | Search across SharePoint sites + user drives, filter by `lastModifiedDateTime`, sort by `size desc` |
| 4.2 | `DriveService.deleteFiles(fileIds)` | `DELETE /drives/{driveId}/items/{itemId}` (recycle bin) with fallback handling |
| 4.3 | `DriveService.archiveFiles(fileIds)` | `PATCH /drives/{driveId}/items/{itemId}` rename with `[ARCHIVED]_` prefix |
| 4.4 | `DriveController` — REST endpoints | `/api/drive/audit`, `/api/drive/files/delete`, `/api/drive/files/archive` |
| 4.5 | Vue: `DriveView.vue` + `AuditFilter.vue` + `FileTable.vue` | Port Tab 4 |
| 4.6 | Unit tests: `DriveServiceTest` — mock Graph responses | Test permission fallback logic |

### Phase 5: Email Notifications (Day 11)

**Goal:** Send templated HTML emails to selected users.

| # | Task | Details |
|---|---|---|
| 5.1 | `MailService.sendBatchEmail(recipients, subject, bodyTemplate)` | `POST /users/{admin}/sendMail` per recipient, with `{name}` / `{email}` substitution |
| 5.2 | Flyway migration: `email_logs` table | SQL DDL |
| 5.3 | `MailController` — REST endpoint | `/api/mail/send` |
| 5.4 | Vue: `MailView.vue` + `RecipientSelector.vue` + `EmailComposer.vue` | Port Tab 5 |

### Phase 6: Lifecycle Automation (Day 12)

**Goal:** Scheduled task checks deletion queue, auto-deletes expired accounts.

| # | Task | Details |
|---|---|---|
| 6.1 | `LifecycleService.syncDisabledUsers()` | Query `GET /users?$filter=accountEnabled eq false`, insert into `lifecycle_actions` if not present |
| 6.2 | `LifecycleService.processDeletionQueue()` | Query DB for `status='DISABLED' AND scheduled_deletion_date <= today`, call `DELETE /users/{id}` |
| 6.3 | `@Scheduled` cron on `processDeletionQueue()` | Daily 1:00 AM UTC+8 |
| 6.4 | `LifecycleController` — manual trigger endpoints | `/api/lifecycle/sync`, `/api/lifecycle/process-queue`, `/api/lifecycle/install-schedule` |

### Phase 7: Polish, Security & Testing (Days 13–15)

| # | Task | Details |
|---|---|---|
| 7.1 | Spring Security hardening — CSRF, rate limiting, role checks | Ensure only admin users can access |
| 7.2 | Global exception handler (`@ControllerAdvice`) | Structured error responses, Graph API error extraction |
| 7.3 | Request/response logging interceptor | Log all API calls with timing |
| 7.4 | Frontend: loading overlay, error toasts, confirmation dialogs | Port GAS `setLoader()` pattern |
| 7.5 | Frontend: Chinese (Traditional) i18n | Match GAS UI language |
| 7.6 | Integration tests with WireMock (mock Graph API) | End-to-end controller tests |
| 7.7 | Docker Compose production config | Environment secrets, resource limits, health checks |
| 7.8 | README.md with setup instructions | Entra registration, Docker deploy, env vars |

---

## 10. Claude Code Workflow (VS Code Insiders)

### 10.1 Prerequisites

```bash
# 1. Install VS Code Insiders
# Download from: https://code.visualstudio.com/insiders/

# 2. Install Claude Code extension
#    Open VS Code Insiders → Extensions → search "Claude Code" → Install

# 3. Install Docker Desktop
# 4. Install Java 21 JDK (Temurin)
# 5. Install Node.js 20 LTS
# 6. Install Maven 3.9+
```

### 10.2 Step-by-Step Claude Code Prompts

Each phase below is a series of prompts to give Claude Code in VS Code Insiders. Open the Claude Code panel (`Ctrl+L` or sidebar) and use these prompts sequentially.

#### Phase 0 Prompts

```
Prompt 1:
"Create a new Spring Boot 3.3.5 project in ./backend with Java 21.
Include these starters: web, security, oauth2-client, data-jpa, validation.
Add dependencies: microsoft-graph 6.29.0, azure-identity 1.14.2,
commons-csv 1.11.0, h2 (runtime), postgresql (runtime), flyway-core, lombok.
Use the package com.admin.m365suite. Create a basic Application class."

Prompt 2:
"Create GraphClientConfig.java in config/ package.
It should create a @Bean GraphServiceClient using ClientSecretCredential
from azure-identity. Read tenant-id, client-id, client-secret from
application.yml under app.azure.*. The scope should be
https://graph.microsoft.com/.default"

Prompt 3:
"Create SecurityConfig.java that:
- Permits GET/POST/PUT/DELETE on /api/** without CSRF for now
- Enables OAuth2 login with Azure provider
- Configures CORS to allow http://localhost:5173 (Vite dev server)
Create a separate CorsConfig.java with a global CORS filter."

Prompt 4:
"Create SystemController.java with:
- GET /api/system/health → returns { status: 'UP', version: '1.0.0' }
- GET /api/system/version → returns app version from config
- GET /api/system/connection-test → calls graphClient.me().get()
  and returns the display name (or error if not configured)"

Prompt 5:
"Create application.yml with Spring profiles (dev uses H2, prod uses
PostgreSQL). Include Azure OAuth2 config reading from environment
variables. Add app.* custom properties for version, timezone,
batch limits, lifecycle cron. Include Flyway config."

Prompt 6:
"Scaffold a Vue 3 project in ./frontend using Vite.
Add vue-router 4, pinia, axios, bootstrap 5.3, bootstrap-icons 1.11.
Create the basic App.vue with a sidebar navigation matching these tabs:
Education Manager, User Lifecycle, Groups & Members, Drive Audit, Email Notify.
Use Bootstrap 5 nav-tabs. Create placeholder view components for each tab.
Create an axios client instance in api/client.js that points to
VITE_API_BASE_URL. Create a LoadingOverlay.vue component."

Prompt 7:
"Create docker-compose.yml with three services:
db (postgres:16-alpine), backend (Spring Boot), frontend (Vue/Nginx).
Create Dockerfile for backend (multi-stage: build with Maven, run with JRE 21).
Create Dockerfile for frontend (multi-stage: build with Node 20, serve with nginx).
Create nginx.conf that serves the Vue SPA and proxies /api/ to backend:8080."
```

#### Phase 1 Prompts (Directory)

```
Prompt 8:
"Create DirectoryService.java that uses GraphServiceClient to:
- listAdminUnits(): GET administrative units, return list of {id, displayName}
- listUsers(ouId, dateCondition, specificDate): GET users with $filter
  supporting ALL, NEVER_LOGIN (signInActivity is null), BEFORE_DATE.
  Include pagination with nextPageToken. Select: id, displayName,
  mail, accountEnabled, signInActivity, department.
- disableUsers(userIds): PATCH each user with accountEnabled=false
- moveUsersToUnit(userIds, unitId): POST members/$ref to admin unit
Follow the same result pattern as GAS: return success/error arrays."

Prompt 9:
"Create the JPA entity SystemLog.java with fields:
id (auto), timestamp (LocalDateTime), action (String), target (String),
status (String), detail (String 4000 chars), version (String).
Create SystemLogRepository. Create AuditLogService that provides
logAction(action, target, status, detail) — inserts a row and
auto-truncates to keep max 2000 rows (delete oldest).
Port the truncation logic from GAS logSystemAction_()."

Prompt 10:
"Create Flyway migrations V1__create_system_logs.sql and
V2__create_lifecycle_actions.sql. lifecycle_actions has:
id, timestamp, user_email, status (DISABLED/DELETED), 
scheduled_deletion_date, version."

Prompt 11:
"Create DirectoryController.java with:
- GET /api/directory/admin-units
- POST /api/directory/users/filter (body: {unitId, dateCondition, specificDate})
- POST /api/directory/users/disable (body: {userIds: []})
- POST /api/directory/users/move (body: {userIds: [], targetUnitId})
All endpoints call AuditLogService for logging."

Prompt 12:
"Create the Vue components for the Directory/User Lifecycle tab:
- DirectoryView.vue: layout matching GAS Tab 2 (filters bar + toolbar + table)
- UserFilter.vue: OU selector, status condition dropdown, date picker
- UserTable.vue: checkbox table with name, email, last login, status, OU
- BulkActions.vue: Suspend button, Move-to-OU dropdown, Sync button
- OuSelector.vue (shared): dropdown that loads admin units from API
Wire everything to the Pinia store and API calls."
```

#### Phase 2 Prompts (Groups)

```
Prompt 13:
"Create GroupService.java that uses GraphServiceClient to:
- listGroups(): paginated list of M365 and security groups
- createGroup(email, displayName, description): POST /groups
- assignMembers(groupIds, userIds, role): add members with retry
  (3 attempts, 3s * attempt backoff). Handle 'already exists' as skip.
Port the retry pattern from GAS runGroupMemberInsertWithRetry_()."

Prompt 14:
"Create BatchParsingService.java — a generic CSV/TSV parser:
- detectDelimiter(fileName, content): port detectBatchDelimiter_()
- parseRows(content, delimiter): use Apache Commons CSV
- Create HeaderAliasResolver that takes a Map<String,String> of aliases
  and maps header row to canonical field names.
Port all alias maps from GAS (COURSE_BATCH_HEADER_ALIAS_LOOKUP,
GROUP_BATCH_HEADER_ALIAS_LOOKUP). Make it reusable for both
class and group batch processors."

Prompt 15:
"Create GroupBatchProcessor.java:
- process(fileName, content): parse CSV/TSV, validate rows,
  dedupe against existing groups, create groups one by one
  (Graph doesn't have a group batch endpoint), collect results.
- Return BatchUploadResult DTO matching GAS processBatchGroupUpload() shape.
Create GroupAuditLog entity + repository + Flyway migration V4."

Prompt 16:
"Create GroupController.java with:
- GET /api/groups
- POST /api/groups/batch (multipart file upload)
- POST /api/groups/members/assign (body: AssignMembersRequest)
- GET /api/groups/template?format=csv|tsv (download CSV/TSV template)
Create TemplateService for generating sample templates."

Prompt 17:
"Create Vue components for Groups & Members tab:
- GroupsView.vue: two-column layout matching GAS Tab 3
- GroupList.vue: table of existing groups (email, name, member count)
- BatchGroupUpload.vue: file input + upload button + result display
- MemberAssignment.vue: multi-select groups, role dropdown, OU user loader
- BatchResultDisplay.vue (shared): renders summary/created/skipped/errors
Reuse OuSelector.vue and UserChecklist.vue."
```

#### Phase 3 Prompts (Education)

```
Prompt 18:
"Create EducationService.java that uses GraphServiceClient to:
- listClasses(): GET /education/classes with pagination
- createClass(name, section, description, mailNickname):
  POST /education/classes
- deleteClass(id): DELETE /education/classes/{id}
- archiveClasses(ids): archive the underlying Teams group
- addTeacher(classId, teacherUserId): POST teachers/$ref
- addMembers(classId, userIds): POST members/$ref for each
- getMembers(classId): GET members, return email list
- syncEnrollment(classId, toAdd, toRemove): add + remove members
Map response to DTOs similar to GAS course objects."

Prompt 19:
"Create GraphBatchService.java — a generic JSON batch helper:
- executeBatch(List<GraphBatchRequest> requests): builds JSON batch
  body with up to 20 requests per call, chunks larger lists,
  sends POST /$batch, parses responses, maps results by request id.
This replaces the GAS executeBatchOperations_() multipart pattern.
Graph JSON batch format:
{ requests: [{ id: '1', method: 'POST', url: '/education/classes',
  body: {...}, headers: {...} }] }"

Prompt 20:
"Create ClassBatchProcessor.java implementing the 2-phase pattern
from GAS runCourseBatchPhases_():
Phase 1: Create education classes (via GraphBatchService)
Phase 2: Assign teachers to created classes (via GraphBatchService)
Handle partial success: class created but teacher failed.
Return BatchUploadResult with created/partial/skipped/errors arrays."

Prompt 21:
"Create EducationController.java with all endpoints:
- GET /api/education/classes
- POST /api/education/classes (create single)
- DELETE /api/education/classes/{id}
- POST /api/education/classes/archive (body: {classIds: []})
- POST /api/education/classes/delete-batch (body: {classIds: []})
- POST /api/education/classes/batch (multipart file upload)
- GET /api/education/classes/{id}/members
- POST /api/education/classes/{id}/enrollment (body: {toAdd, toRemove})
- GET /api/education/template?format=csv|tsv"

Prompt 22:
"Create all Vue components for the Education tab:
- EducationView.vue: two-column layout (left: class list, right: enrollment)
- ClassList.vue: checkbox table with archive/delete buttons, matching GAS
- CreateClassForm.vue: name, section, teacher selector (from OU), create button
- BatchUploadCard.vue: file upload with CSV/TSV sample download
- EnrollmentPanel.vue: course selector, OU user loader with pre-check badges
- ArchivedClassList.vue: table with bulk delete
Port the enrolledEmailsCache_ and loadedOuEmails_ patterns to Pinia store."
```

#### Phase 4–6 Prompts (Drive, Mail, Lifecycle)

```
Prompt 23:
"Create DriveService.java:
- findOutdatedFiles(beforeDate): search across user drives and
  SharePoint sites for files with lastModifiedDateTime < cutoff.
  Sort by size desc. Return list of {id, driveId, name, webUrl,
  owner, modified, size, isFolder}.
- deleteFiles(items): DELETE each item. If permission denied,
  fall back to move-to-recycle-bin. Port GAS trash fallback pattern.
- archiveFiles(items): PATCH rename with [ARCHIVED]_ prefix.
Create DriveController with /api/drive/audit, /delete, /archive."

Prompt 24:
"Create MailService.java:
- sendBatchEmail(recipients, subject, bodyTemplate, senderUserId):
  For each recipient, resolve {name} by looking up user displayName
  via Graph, replace {name} and {email} in template, then call
  POST /users/{senderUserId}/sendMail with HTML body.
  Log each send to email_logs table.
Create MailController with POST /api/mail/send.
Create Flyway migration V5__create_email_logs.sql."

Prompt 25:
"Create LifecycleService.java:
- syncDisabledUsers(): query Graph for accountEnabled=false users,
  insert into lifecycle_actions if not present, set scheduled
  deletion date to now + 3 months.
- processDeletionQueue(): query lifecycle_actions for
  status=DISABLED and scheduled_deletion_date <= today,
  call DELETE /users/{id} for each, update status to DELETED.
Add @Scheduled annotation for daily 1 AM execution.
Create LifecycleController for manual trigger endpoints."

Prompt 26:
"Create Vue components for Drive Audit tab and Email tab:
- DriveView.vue: date filter + file table with checkboxes + 
  archive/delete buttons. Match GAS Tab 4 layout.
- MailView.vue: two-column (left: recipient selector from OU,
  right: email composer with subject, HTML body textarea,
  variable insertion dropdown for {name} and {email}).
  Match GAS Tab 5 layout."
```

#### Phase 7 Prompts (Polish)

```
Prompt 27:
"Add global exception handling with @ControllerAdvice:
- Handle Graph API ServiceException → extract error code + message
- Handle IllegalArgumentException → 400
- Handle all other exceptions → 500 with safe message
Create GraphErrorExtractor utility that parses Graph SDK exceptions
into user-friendly messages. Port extractApiErrorMessage_() pattern."

Prompt 28:
"Add traditional Chinese (繁體中文) labels to all Vue components.
Match the GAS UI copy exactly where applicable. Create an i18n
constants file or use vue-i18n with zh-TW locale messages."

Prompt 29:
"Write unit tests for:
- BatchParsingServiceTest: delimiter detection, CSV/TSV parsing
- HeaderAliasResolverTest: all alias mappings
- ClassBatchProcessorTest: 2-phase with mock Graph responses,
  partial teacher failure scenario
- GroupBatchProcessorTest: dedupe, validation, create with errors
- GraphBatchServiceTest: chunking 100 requests into 5 batches of 20
Port all scenarios from GAS AdminSuite.tests.gs."

Prompt 30:
"Finalize Docker setup:
- Ensure docker-compose.yml health checks work
- Add docker-compose.dev.yml with hot-reload for both backend
  (spring-boot-devtools) and frontend (vite dev server)
- Create .env.example with placeholder values
- Create README.md with: prerequisites, Entra app registration steps,
  Docker deployment instructions, development setup, environment variables."
```

### 10.3 Claude Code Tips for This Project

**Working with large files:** When asking Claude Code to create a service with many methods, break it into smaller prompts — one method at a time — to get higher quality output.

**Referencing GAS code:** You can paste relevant GAS function snippets into your prompt and say "Port this function to Java using GraphServiceClient. Keep the same error handling pattern but adapt to Graph API responses."

**Testing workflow:**
```
1. Write the service method
2. Ask Claude Code: "Write a unit test for EducationService.createClass()
   that mocks GraphServiceClient and verifies the correct Graph API call"
3. Run: mvn test -pl backend
4. Fix any failures by pasting the error back to Claude Code
```

**Docker iteration:**
```bash
# Quick rebuild single service
docker compose build backend && docker compose up -d backend

# View logs
docker compose logs -f backend

# Run backend tests inside container
docker compose exec backend ./mvnw test
```

---

## 11. API Endpoint Summary

| Method | Path | Description | GAS Equivalent |
|---|---|---|---|
| GET | `/api/system/health` | Health check | `testApiConnection()` |
| GET | `/api/system/version` | App version | `APP_VERSION` |
| GET | `/api/education/classes` | List active classes | `listCourses()` |
| GET | `/api/education/classes/archived` | List archived classes | `listArchivedCourses()` |
| POST | `/api/education/classes` | Create single class | `createClassroomCourse()` |
| DELETE | `/api/education/classes/{id}` | Delete single class | `deleteClassroomCourse()` |
| POST | `/api/education/classes/archive` | Batch archive | `archiveClassroomCourses()` |
| POST | `/api/education/classes/delete-batch` | Batch delete | `deleteClassroomCourses()` |
| POST | `/api/education/classes/batch` | CSV/TSV upload create | `processBatchCourseUpload()` |
| GET | `/api/education/classes/{id}/members` | List enrolled students | `getEnrolledStudentEmails()` |
| POST | `/api/education/classes/{id}/enrollment` | Sync enrollment | `applyEnrollmentChanges()` |
| GET | `/api/education/template` | Download CSV/TSV template | `getCourseBatchTemplate()` |
| GET | `/api/groups` | List all groups | `getWorkspaceGroups()` |
| POST | `/api/groups/batch` | CSV/TSV batch create | `processBatchGroupUpload()` |
| POST | `/api/groups/members/assign` | Assign members to groups | `assignMembersToGroups()` |
| GET | `/api/groups/template` | Download template | `getGroupBatchTemplate()` |
| GET | `/api/directory/admin-units` | List admin units (OUs) | `getDomainOUs()` |
| POST | `/api/directory/users/filter` | Filter users | `getFilteredUsers()` |
| POST | `/api/directory/users/disable` | Disable (suspend) users | `processUserSuspension()` |
| POST | `/api/directory/users/move` | Move users to AU | `moveUsersToOU()` |
| POST | `/api/drive/audit` | Find outdated files | `findOutdatedFiles()` |
| POST | `/api/drive/files/delete` | Batch delete files | `manageFiles('delete')` |
| POST | `/api/drive/files/archive` | Batch archive files | `manageFiles('archive')` |
| POST | `/api/mail/send` | Send batch email | `sendCustomEmailBatch()` |
| POST | `/api/lifecycle/sync` | Sync disabled to queue | `syncSuspendedToQueue()` |
| POST | `/api/lifecycle/process-queue` | Run deletion queue | `checkDeletionQueue()` |

---

## 12. Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Education API endpoints still in beta | Breaking changes possible | Pin Graph SDK version, abstract behind service layer, monitor MS changelogs |
| `signInActivity` requires Azure AD P1/P2 | Last-login filter may not work on all tenants | Graceful fallback: skip filter if `403`, show warning in UI |
| Graph API rate limiting (429) | Batch operations throttled | Implement exponential backoff with `Retry-After` header, chunk batches to 20 |
| Group propagation delay | Member add fails immediately after group create | Already mitigated: 3-attempt retry with `3s * attempt` backoff (ported from GAS) |
| Docker networking across platforms | DNS resolution differences | Use Docker Compose service names, test on Linux + Mac + Windows |
| OAuth token expiry during long batch operations | Mid-operation auth failure | MSAL handles token refresh; add token validity check before batch start |
| PostgreSQL data growth | Log tables grow unbounded | Auto-truncation logic ported from GAS (2000/5000 row caps), add DB vacuum schedule |

---

## 13. Timeline Summary

| Phase | Days | Deliverable |
|---|---|---|
| Phase 0: Scaffolding | 1 | Skeleton project, Docker runs, health endpoint |
| Phase 1: Directory | 2 | Users, admin units, suspend, move |
| Phase 2: Groups | 2 | Group CRUD, batch create, member assign |
| Phase 3: Education | 3 | Classes CRUD, enrollment, batch upload |
| Phase 4: Drive | 2 | File audit, delete, archive |
| Phase 5: Email | 1 | Templated email sending |
| Phase 6: Lifecycle | 1 | Scheduled deletion queue |
| Phase 7: Polish | 3 | Security, i18n, tests, Docker prod |
| **Total** | **~15 days** | **Feature parity with GAS AdminSuite v2.2.1** |

---

## Appendix A: Graph JSON Batch Example

Replaces GAS `buildBatchMultipartRequest_()` / `parseBatchMultipartResponse_()`:

```json
POST https://graph.microsoft.com/v1.0/$batch
Content-Type: application/json

{
  "requests": [
    {
      "id": "create-1",
      "method": "POST",
      "url": "/education/classes",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "displayName": "Math 6A",
        "mailNickname": "math6a-2026spring",
        "description": "Grade 6 math class",
        "externalId": "math-6a-2026"
      }
    },
    {
      "id": "create-2",
      "method": "POST",
      "url": "/education/classes",
      "headers": { "Content-Type": "application/json" },
      "body": {
        "displayName": "Science 5B",
        "mailNickname": "science5b-2026spring",
        "description": "Grade 5 science class",
        "externalId": "science-5b-2026"
      }
    }
  ]
}
```

Response:

```json
{
  "responses": [
    {
      "id": "create-1",
      "status": 201,
      "headers": { "Content-Type": "application/json" },
      "body": { "id": "abc123", "displayName": "Math 6A", ... }
    },
    {
      "id": "create-2",
      "status": 201,
      "body": { "id": "def456", "displayName": "Science 5B", ... }
    }
  ]
}
```

## Appendix B: GraphServiceClient Usage Patterns

```java
// List users with filter
var users = graphClient.users().get(config -> {
    config.queryParameters.filter = "accountEnabled eq false";
    config.queryParameters.select = new String[]{
        "id","displayName","mail","accountEnabled","signInActivity"
    };
    config.queryParameters.top = 500;
});

// Create education class
var eduClass = new EducationClass();
eduClass.setDisplayName("Math 6A");
eduClass.setMailNickname("math6a");
eduClass.setDescription("Grade 6 math");
eduClass.setExternalId("math-6a-2026");
graphClient.education().classes().post(eduClass);

// Add member to group
var ref = new ReferenceCreate();
ref.setOdataId("https://graph.microsoft.com/v1.0/users/" + userId);
graphClient.groups().byGroupId(groupId).members().ref().post(ref);

// Send mail
var message = new Message();
var body = new ItemBody();
body.setContentType(BodyType.Html);
body.setContent("<p>Hello {name}</p>");
message.setSubject("Notice");
message.setBody(body);
message.setToRecipients(List.of(recipient));
var sendMailBody = new SendMailPostRequestBody();
sendMailBody.setMessage(message);
graphClient.users().byUserId(senderEmail).sendMail().post(sendMailBody);
```
