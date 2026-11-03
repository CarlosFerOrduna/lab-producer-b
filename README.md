# lab-producer-b

One of the two producer services of the lab: a NestJS service that will publish events to Kafka for [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) to consume.

## Role in the lab

Runs in its own `producer-b` namespace of the k3s cluster. [lab-producer-a](https://github.com/CarlosFerOrduna/lab-producer-a) runs in its own namespace too, and both feed the single processor in the `platform` namespace. Unlike lab-producer-a, it has a PostgreSQL database of its own. ArgoCD deploys it from [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops) (`producer-b/`).

## Status

Today:

- `GET /health` returns `200 {"status":"ok"}`.
- An item catalog (see [API](#api)) in its own PostgreSQL, accessed through TypeORM. Adding an item publishes an `item.created` event to the processor.
- Events go out through an `EventPublisher` interface. Today it posts them to the processor over HTTP, retrying transient failures; the Kafka stage replaces only that implementation.
- The schema lives in versioned SQL migrations (`migrations/postgres/`), applied by a separate command before the service starts.
- Environment configuration validated at startup with Joi.
- Multi-stage `Dockerfile` that runs as the unprivileged `node` user, on a base image pinned by digest.
- A `compose.yaml` that reproduces today's starting point: PostgreSQL bundled in the service's own compose.
- npm scripts that CI will call:

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run lint`      | ESLint, without `--fix`, so violations fail the build.    |
| `npm run migrate`   | Applies the pending migrations (`dist/migrate.js`).       |
| `npm test`          | Jest unit tests (`*.spec.ts` next to the code they test). |
| `npm run build`     | Compiles to `dist/`.                                      |
| `npm start`         | Runs `dist/main`.                                         |
| `npm run start:dev` | Watch mode for local work.                                |
| `npm run format`    | Prettier over `src/`.                                     |

NestJS 12 ships as ES modules only, so `npm test` runs Jest with `--experimental-vm-modules`.

Planned:

- Publish events to Kafka topics under `producer-b.*`, replacing the HTTP publisher, with a transactional outbox so a saved item never loses its event.
- Call the processor through the platform gateway, never directly.
- One Redis for cache and a separate Redis for BullMQ queues.
- Its own PostgreSQL, in two steps:
  1. Start with PostgreSQL bundled in the service's docker compose. **(Today.)** This is the other pattern services use today, next to the embedded SQLite that [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) starts with.
  2. Move that PostgreSQL out of the service's package and into the cluster, as a StatefulSet with its own volume, its own Secret and its own lifecycle, migrating its data. Same engine: the change is where and how the database lives, not what it is.
- Graceful shutdown: stop accepting work, flush pending messages, then exit.

## Run locally

Requires Node 26 (see `.nvmrc`) and Docker. Events go to the processor of [lab-processor](https://github.com/CarlosFerOrduna/lab-processor)'s compose, on port 3000.

Create a local `.env` with the database password for compose. It is ignored by git and never committed:

```bash
printf 'POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 16)" > .env
chmod 600 .env
```

Everything in Docker Compose, on port 3002:

```bash
docker compose up --build
```

`postgres` starts first; `migrate` waits until it is healthy, applies the migrations and exits; `producer-b` starts only after that succeeds. The data lives in the `postgres-data` volume (`docker compose down -v` deletes it). The container reaches the processor through the host (`host.docker.internal`).

The service itself never reads `.env`: compose uses it to fill in `compose.yaml`, and passes real environment variables to the containers.

## API

| Method and path  | What it does                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| `POST /items`    | Body `{ "name": "...", "quantity": 0 }`. Stores the item, publishes `item.created` and answers `201` with the item. |
| `GET /items`     | The latest items first. Optional `limit` (1 to 100, default 20) and `offset`.                                       |
| `GET /items/:id` | One item, or `404`.                                                                                                 |

```bash
curl -X POST localhost:3002/items -H 'content-type: application/json' -d '{"name":"first","quantity":2}'
curl 'localhost:3000/events?source=producer-b'   # on the processor
```

Publishing makes up to 3 attempts with exponential backoff and a 2 s timeout each. **Known gap:** the item is saved before the event is published, in two separate steps. If the processor stays down, the item is kept, the event is lost, and only an error log says so. A transactional outbox (the event saved in the same transaction as the item, and published afterwards) closes that gap; it is planned with Kafka.

## Configuration

The service reads only real environment variables. `.env` files are ignored by the service, so pass values in the shell or with `docker run -e`.

| Variable            | Default      | Validation                                                |
| ------------------- | ------------ | --------------------------------------------------------- |
| `NODE_ENV`          | `production` | One of `development`, `test`, `production`.               |
| `PORT`              | `3000`       | A valid TCP port number.                                  |
| `PROCESSOR_URL`     | required     | `http` or `https` URL of the processor.                   |
| `DATABASE_HOST`     | required     | Host name of PostgreSQL.                                  |
| `DATABASE_PORT`     | `5432`       | A valid TCP port number.                                  |
| `DATABASE_NAME`     | required     | Database name.                                            |
| `DATABASE_USER`     | required     | Database user.                                            |
| `DATABASE_PASSWORD` | required     | Database password. In the cluster it comes from a Secret. |

`npm run migrate` needs only the `DATABASE_*` variables. An invalid value stops the service at startup with a validation error. The image carries no environment-specific values: the same image runs in dev, stage and prod, and each environment's values come from its overlay in [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops).

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
