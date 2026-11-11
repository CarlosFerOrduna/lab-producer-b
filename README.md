# lab-producer-b

One of the two producer services of the lab: a NestJS service that publishes events to Kafka for [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) to consume.

## Role in the lab

Runs in its own `producer-b` namespace of the k3s cluster. [lab-producer-a](https://github.com/CarlosFerOrduna/lab-producer-a) runs in its own namespace too, and both feed the single processor in the `platform` namespace. Unlike lab-producer-a, it has a PostgreSQL database of its own. ArgoCD deploys it from [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops) (`producer-b/`).

## Status

Today:

- `GET /health` returns `200 {"status":"ok"}`.
- An item catalog (see [API](#api)) in its own PostgreSQL, accessed through TypeORM. Adding an item queues an `item.created` event in its own Valkey with BullMQ.
- A separate worker process takes the events from the queue and publishes them to the Kafka topic `producer-b.items`, with its own client certificate (mTLS), through an `EventPublisher` interface (see [Kafka publishing](#kafka-publishing)). Retries, with backoff, belong to the queue (see [Queue](#queue)).
- `GET /items/:id` reads through a second Valkey, used only as a cache (see [Cache](#cache)).
- `GET /health` for liveness and `GET /health/ready` for readiness: ready only if the database answers and the queue accepts writes; never depends on the cache.
- The schema lives in versioned SQL migrations (`migrations/postgres/`), applied by a separate command before the service starts.
- Environment configuration validated at startup with Joi.
- Multi-stage `Dockerfile` that runs as the unprivileged `node` user, on a base image pinned by digest.
- A `compose.yaml` with PostgreSQL, the queue's and the cache's Valkey, and the API. The worker runs only in the cluster, next to Kafka.
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

- A transactional outbox, so a saved item never loses its event, and retire the queue, so events of one item keep their order (see [Kafka publishing](#kafka-publishing)).
- Call the processor through the platform gateway, never directly.
- Its own PostgreSQL, in two steps:
  1. Start with PostgreSQL bundled in the service's docker compose. **(Today.)** This is the other pattern services use today, next to the embedded SQLite that [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) starts with.
  2. Move that PostgreSQL out of the service's package and into the cluster, as a StatefulSet with its own volume, its own Secret and its own lifecycle, migrating its data. Same engine: the change is where and how the database lives, not what it is.
- Graceful shutdown: stop accepting work, flush pending messages, then exit.

## Run locally

Requires Node 26 (see `.nvmrc`) and Docker. Compose runs no Kafka, so it runs no worker either: events wait in the local queue.

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
- `producer-b`: the API. The worker is the same image running `node dist/worker.js`, in the cluster only.

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
curl -i localhost:3002/items/<id>   # X-Cache: MISS, then HIT
```

**Known gap:** the item is saved before its event is queued, in two separate steps. If the queue is down at that moment, the item is kept, the event is lost, and only an error log says so (the queue makes this much less likely than publishing straight to the processor, but does not rule it out). A transactional outbox closes that gap; it is planned.

## Queue

- BullMQ queue `events` on its own Valkey. The job id is the event id, so the same event queued twice is stored once, and the processor stores each id once.
- The worker publishes with a single attempt, bounded by 5 s. On failure, BullMQ retries with a backoff that doubles from 1 s up to 60 s, for 1440 attempts (about a day).
- A record Kafka refuses (see [Kafka publishing](#kafka-publishing)) means a bad event: the worker throws `UnrecoverableError` and the job fails at once, without retries.
- With `noeviction`, Valkey never frees memory on its own, so finished jobs are trimmed: the last 1000 completed, and failed ones for 7 days.
- On `SIGTERM` the worker calls `worker.close()`: it finishes the jobs in progress before exiting.
- The queue is stored with AOF (`appendfsync everysec`): events survive a Valkey restart, and at most the last second of writes is lost if the machine stops abruptly.

## Cache

- Cache-aside on `GET /items/:id`: read the cache, and on a miss read the database and store the item for 5 minutes (`item:<id>`). Items never change, so the TTL only bounds memory.
- The cache is never required: any cache failure (down, slow, full) counts as a miss and the item comes from the database. Commands time out after 100 ms and are never queued while the cache is disconnected, so a dead cache costs a database read, not a slow response.
- No persistence and `allkeys-lru`: a restart starts empty, and when full it evicts the least recently used items.

## Kafka publishing

The worker (`node dist/worker.js`, in the cluster the `producer-b-worker` Deployment) publishes each event to the topic `producer-b.items` as the Kafka user `producer-b`, with its own client certificate (mTLS). Its ACL allows writing only to topics under `producer-b.`. It serves only `GET /health`, for its liveness probe.

- **Key**: the item's id (`payload.itemId`), so every event about one item goes to the same partition.
- **Value**: the whole event as JSON, with its `id`: the processor stores each `id` once.
- **TLS**: only the CA, the certificate and its key. Node checks the broker's certificate chain and host name, so the brokers are reached by host name, never by IP.

**Delivery is at-least-once.** The producer is idempotent (`acks: all`), so the broker drops the duplicates of the client's own internal retries. It cannot drop BullMQ's: when a send outlasts its 5 s timeout but reaches Kafka later, BullMQ's retry publishes the event again. The processor absorbs those duplicates, since it stores each event `id` once.

**Order per key is not guaranteed yet.** With BullMQ in between, a failed event is retried after later events, so an event can reach Kafka after a newer event about the same item. Publishing from a transactional outbox, without the queue, is planned.

| What happens                                                     | The worker                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kafka takes the event                                            | Completes the job.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Kafka refuses the record (`MESSAGE_TOO_LARGE`, `INVALID_RECORD`) | Fails the job at once, without retries: sending it again gets the same answer.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Kafka is down, or does not answer within 5 s                     | Fails the attempt; BullMQ retries it with backoff. The event waits in the queue meanwhile.                                                                                                                                                                                                                                                                                                                                                                                         |
| It cannot reach Kafka when it starts                             | Keeps serving `/health` and takes no job from the queue. A certificate error (`ERR_TLS_*` but a handshake timeout, `*CERT*`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `*UNKNOWN_CA`) fails at once, since retrying cannot fix it. Anything else is retried every 2 s for at most 120 s. Either way it then logs the root cause (`Could not start publishing: … <- Error[ERR_TLS_CERT_ALTNAME_INVALID]: …`) and exits with 1, and Kubernetes' CrashLoopBackOff decides when to try again. |

The worker takes jobs from the queue only after Kafka answers: before that, a job would only fail and wait for its backoff. The Kafka client gives up a send on its own within about 10 s (2 s to connect, 3 s per request, 2 retries), so sends never pile up in the client while BullMQ retries: by default, an idempotent producer retries forever.

The image carries no optional dependencies (`npm prune --omit=optional`): `@platformatic/kafka` computes CRC32C in WASM instead of the prebuilt native binary of `@node-rs/crc32`, so the image has no native code.

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

The worker also needs these (the API ignores them):

| Variable                  | Default             | Validation                                                                 |
| ------------------------- | ------------------- | -------------------------------------------------------------------------- |
| `KAFKA_BOOTSTRAP_BROKERS` | required            | Comma-separated `host:port` list. A host name, never an IP: TLS checks it. |
| `KAFKA_CLIENT_ID`         | `producer-b-worker` | The client id the brokers log.                                             |
| `KAFKA_TOPIC`             | required            | The topic it publishes to.                                                 |
| `KAFKA_CA_FILE`           | required            | The CA that verifies the brokers (the lab's root).                         |
| `KAFKA_CERT_FILE`         | required            | The worker's client certificate (`CN=producer-b`).                         |
| `KAFKA_KEY_FILE`          | required            | Its private key.                                                           |

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
