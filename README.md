# lab-producer-b

One of the two producer services of the lab: a NestJS service that will publish events to Kafka for [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) to consume.

## Role in the lab

Runs in its own `producer-b` namespace of the k3s cluster. [lab-producer-a](https://github.com/CarlosFerOrduna/lab-producer-a) runs in its own namespace too, and both feed the single processor in the `platform` namespace. Unlike lab-producer-a, it has a PostgreSQL database of its own. ArgoCD deploys it from [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops) (`producer-b/`).

## Status

Today:

- `GET /health` returns `200 {"status":"ok"}`.
- An item catalog (see [API](#api)) in its own PostgreSQL, accessed through TypeORM. Adding an item queues an `item.created` event in its own Valkey with BullMQ.
- A separate worker process takes the events from the queue and publishes them to the processor over HTTP, through an `EventPublisher` interface; the Kafka stage replaces only that implementation. Retries, with backoff, belong to the queue (see [Queue](#queue)).
- `GET /items/:id` reads through a second Valkey, used only as a cache (see [Cache](#cache)).
- `GET /health` for liveness and `GET /health/ready` for readiness: ready only if the database answers and the queue accepts writes; never depends on the cache.
- The schema lives in versioned SQL migrations (`migrations/postgres/`), applied by a separate command before the service starts.
- Environment configuration validated at startup with Joi.
- Multi-stage `Dockerfile` that runs as the unprivileged `node` user, on a base image pinned by digest.
- A `compose.yaml` with PostgreSQL, the queue's and the cache's Valkey, the API and the worker.
- npm scripts that CI will call:

| Script                 | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run lint`         | ESLint, without `--fix`, so violations fail the build.    |
| `npm run migrate`      | Applies the pending migrations (`dist/migrate.js`).       |
| `npm test`             | Jest unit tests (`*.spec.ts` next to the code they test). |
| `npm run build`        | Compiles to `dist/`.                                      |
| `npm start`            | Runs the API (`dist/main`).                               |
| `npm run start:worker` | Runs the worker (`dist/worker`).                          |
| `npm run start:dev`    | Watch mode for local work.                                |
| `npm run format`       | Prettier over `src/`.                                     |

NestJS 12 ships as ES modules only, so `npm test` runs Jest with `--experimental-vm-modules`.

Planned:

- Publish events to Kafka topics under `producer-b.*`, replacing the HTTP publisher in the worker, with a transactional outbox so a saved item never loses its event.
- Call the processor through the platform gateway, never directly.
- Its own PostgreSQL, in two steps:
  1. Start with PostgreSQL bundled in the service's docker compose. **(Today.)** This is the other pattern services use today, next to the embedded SQLite that [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) starts with.
  2. Move that PostgreSQL out of the service's package and into the cluster, as a StatefulSet with its own volume, its own Secret and its own lifecycle, migrating its data. Same engine: the change is where and how the database lives, not what it is.
- Graceful shutdown: stop accepting work, flush pending messages, then exit.

## Run locally

Requires Node 26 (see `.nvmrc`) and Docker. Events go to the processor of [lab-processor](https://github.com/CarlosFerOrduna/lab-processor)'s compose, on port 3000.

Create a local `.env` with the passwords for compose. It is ignored by git and never committed:

```bash
for name in POSTGRES_PASSWORD VALKEY_QUEUE_PASSWORD VALKEY_CACHE_PASSWORD; do
  printf '%s=%s\n' "$name" "$(openssl rand -hex 24)"
done > .env
chmod 600 .env
```

Everything in Docker Compose, with the API on port 3002:

```bash
docker compose up --build
```

- `postgres` and `migrate`: the database and its migrations, as before.
- `valkey-queue` (`valkey/queue.conf`: AOF, `noeviction`, 128 MB) and `valkey-cache` (`valkey/cache.conf`: no persistence, `allkeys-lru`, 64 MB). Both run as their own user (999), each with its own password, read from a separate config file that compose builds from `.env` (`include`), never from the command line.
- `producer-b`: the API. `producer-b-worker`: the same image running `node dist/worker.js`, which reaches the processor through the host.

## API

| Method and path     | What it does                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /items`       | Body `{ "name": "...", "quantity": 0 }`. Stores the item, queues `item.created` and answers `201` with the item.                                |
| `GET /items`        | The latest items first, from the database. Optional `limit` (1 to 100, default 20) and `offset`.                                                |
| `GET /items/:id`    | One item, or `404`. Reads through the cache and answers with `X-Cache: HIT` or `X-Cache: MISS`.                                                 |
| `GET /health`       | `200` while the process is up. Never checks a dependency.                                                                                       |
| `GET /health/ready` | `200` if the database answers and the queue accepts a write, each within 1 s; `503` otherwise, naming which one failed. Never checks the cache. |

```bash
curl -X POST localhost:3002/items -H 'content-type: application/json' -d '{"name":"first","quantity":2}'
curl -i localhost:3002/items/<id>                 # X-Cache: MISS, then HIT
curl 'localhost:3000/events?source=producer-b'   # on the processor, once the worker publishes it
```

**Known gap:** the item is saved before its event is queued, in two separate steps. If the queue is down at that moment, the item is kept, the event is lost, and only an error log says so (the queue makes this much less likely than publishing straight to the processor, but does not rule it out). A transactional outbox closes that gap; it is planned with Kafka.

## Queue

- BullMQ queue `events` on its own Valkey. The job id is the event id, so the same event queued twice is stored once, and the processor stores each id once.
- The worker publishes with a single HTTP attempt. On failure, BullMQ retries with a backoff that doubles from 1 s up to 60 s, for 1440 attempts (about a day).
- A `4xx` from the processor means a malformed event: the worker throws `UnrecoverableError` and the job fails at once, without retries.
- With `noeviction`, Valkey never frees memory on its own, so finished jobs are trimmed: the last 1000 completed, and failed ones for 7 days.
- On `SIGTERM` the worker calls `worker.close()`: it finishes the jobs in progress before exiting.
- The queue is stored with AOF (`appendfsync everysec`): events survive a Valkey restart, and at most the last second of writes is lost if the machine stops abruptly.

## Cache

- Cache-aside on `GET /items/:id`: read the cache, and on a miss read the database and store the item for 5 minutes (`item:<id>`). Items never change, so the TTL only bounds memory.
- The cache is never required: any cache failure (down, slow, full) counts as a miss and the item comes from the database. Commands time out after 100 ms and are never queued while the cache is disconnected, so a dead cache costs a database read, not a slow response.
- No persistence and `allkeys-lru`: a restart starts empty, and when full it evicts the least recently used items.

## Configuration

The service reads only real environment variables. `.env` files are ignored by the service: compose uses `.env` only to fill in `compose.yaml`.

| Variable            | Used by            | Default      | Validation                                                     |
| ------------------- | ------------------ | ------------ | -------------------------------------------------------------- |
| `NODE_ENV`          | API and worker     | `production` | One of `development`, `test`, `production`.                    |
| `PORT`              | API and worker     | `3000`       | A valid TCP port number. The worker serves only `GET /health`. |
| `DATABASE_HOST`     | API and migrations | required     | Host name of PostgreSQL.                                       |
| `DATABASE_PORT`     | API and migrations | `5432`       | A valid TCP port number.                                       |
| `DATABASE_NAME`     | API and migrations | required     | Database name.                                                 |
| `DATABASE_USER`     | API and migrations | required     | Database user.                                                 |
| `DATABASE_PASSWORD` | API and migrations | required     | Database password. In the cluster it comes from a Secret.      |
| `QUEUE_HOST`        | API and worker     | required     | Host name of the queue's Valkey.                               |
| `QUEUE_PORT`        | API and worker     | `6379`       | A valid TCP port number.                                       |
| `QUEUE_PASSWORD`    | API and worker     | required     | The queue's Valkey password. In the cluster, from a Secret.    |
| `CACHE_HOST`        | API                | required     | Host name of the cache's Valkey.                               |
| `CACHE_PORT`        | API                | `6379`       | A valid TCP port number.                                       |
| `CACHE_PASSWORD`    | API                | required     | The cache's Valkey password. In the cluster, from a Secret.    |
| `PROCESSOR_URL`     | worker             | required     | `http` or `https` URL of the processor.                        |

An invalid value stops the process at startup with a validation error. The image carries no environment-specific values: the same image runs in dev, stage and prod, and each environment's values come from its overlay in [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops).

## Migrations

Schema changes are versioned SQL files in `migrations/postgres/`, applied in file name order. The runner records each applied file in the `schema_migration` table and runs every file in its own transaction: a failing migration leaves no trace and stops the run.

- Add a change as a new file (`0002_<what_it_does>.sql`); never edit an applied one.
- The service never changes the schema: TypeORM runs with `synchronize: false`.
- The runner holds a PostgreSQL advisory lock while it works, so several replicas starting at once apply each migration exactly once.

## Branch model

| Branch        | Purpose                  |
| ------------- | ------------------------ |
| `development` | Deploys to dev.          |
| `stage`       | Deploys to stage.        |
| `main`        | Deploys to prod.         |
| `fer`         | Personal working branch. |

- `development`, `stage` and `main` are fixed branches: they are never deleted or force-pushed.
- Work happens on the personal branch and is merged locally into `development`, then `development` into `stage`. There are no pull requests.
- Only the production owner updates `main`.

## Pipeline

Today, `.github/workflows/image.yml` publishes the image on every push to `development`, and on demand with **Run workflow** (`workflow_dispatch`). It calls the reusable [`container-image.yml`](https://github.com/CarlosFerOrduna/lab-ci-workflows) of lab-ci-workflows, so the three services publish the same way:

- The tag is the tree hash of the commit (`git rev-parse HEAD^{tree}`): `ghcr.io/carlosferorduna/lab-producer-b:<tree hash>`.
- If that tag already exists, nothing is built: the same content is never published twice.
- It authenticates with the workflow's own `GITHUB_TOKEN` (`packages: write`), never with a personal token.
- The `org.opencontainers.image.source` label links the package to this repository.

Planned:

1. On push to `development`: run the npm scripts (`lint`, `test`), then build an image tagged with the tree hash (`git rev-parse HEAD^{tree}`). The image is deployed to dev only if the tests pass.
2. On push to `stage` or `main`: reuse the image whose tag matches the tree hash. The job fails if that image does not exist and never rebuilds it.
3. CI updates the image tag in the matching [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops) overlay. Dev and stage sync automatically. Prod waits for a manual ArgoCD sync.

Tagging by tree hash means a merge that leaves the files unchanged maps to the same image, so stage and prod run exactly what was tested in dev.

## Lab repositories

| Repository                                                              | Role                                                                                                         |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [lab-infra](https://github.com/CarlosFerOrduna/lab-infra)               | Builds the infrastructure: Hyper-V VMs today, Ansible and k3s next. Holds the repository settings checklist. |
| [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops)             | Desired state of the clusters. ArgoCD applies whatever is in this repo.                                      |
| [lab-ci-workflows](https://github.com/CarlosFerOrduna/lab-ci-workflows) | Reusable GitHub Actions workflows shared by every lab repo.                                                  |
| [lab-processor](https://github.com/CarlosFerOrduna/lab-processor)       | Shared processor service, namespace `platform`.                                                              |
| [lab-producer-a](https://github.com/CarlosFerOrduna/lab-producer-a)     | Producer service, namespace `producer-a`.                                                                    |
| [lab-producer-b](https://github.com/CarlosFerOrduna/lab-producer-b)     | Producer service, namespace `producer-b`.                                                                    |
