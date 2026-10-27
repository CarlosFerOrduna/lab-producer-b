# lab-producer-b

One of the two producer services of the lab: a NestJS service that will publish events to Kafka for [lab-processor](https://github.com/CarlosFerOrduna/lab-processor) to consume.

## Role in the lab

Runs in its own `producer-b` namespace of the k3s cluster. [lab-producer-a](https://github.com/CarlosFerOrduna/lab-producer-a) has the same shape in its own namespace, and both feed the single processor in the `platform` namespace. ArgoCD deploys it from [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops) (`producer-b/`).

## Status

Today:

- `GET /health` returns `200 {"status":"ok"}`.
- Environment configuration validated at startup with Joi.
- Multi-stage `Dockerfile` that runs as the unprivileged `node` user.
- npm scripts that CI will call:

| Script              | What it does                                              |
| ------------------- | --------------------------------------------------------- |
| `npm run lint`      | ESLint, without `--fix`, so violations fail the build.    |
| `npm test`          | Jest unit tests (`*.spec.ts` next to the code they test). |
| `npm run build`     | Compiles to `dist/`.                                      |
| `npm start`         | Runs `dist/main`.                                         |
| `npm run start:dev` | Watch mode for local work.                                |
| `npm run format`    | Prettier over `src/`.                                     |

NestJS 12 ships as ES modules only, so `npm test` runs Jest with `--experimental-vm-modules`.

Planned:

- Publish events to Kafka topics under `producer-b.*`.
- Call the processor through the platform gateway, never directly.
- One Redis for cache and a separate Redis for BullMQ queues.
- No database of its own: persistent data belongs to the processor.
- Graceful shutdown: stop accepting work, flush pending messages, then exit.

## Run locally

Requires Node 26 (see `.nvmrc`).

```bash
nvm use
npm ci
npm run start:dev
curl localhost:3000/health
```

With Docker:

```bash
docker build -t lab-producer-b:local .
docker run --rm -p 3000:3000 lab-producer-b:local
```

## Configuration

The service reads only real environment variables. `.env` files are ignored, so pass values in the shell (`PORT=4000 npm run start:dev`) or with `docker run -e`.

| Variable   | Default      | Validation                                  |
| ---------- | ------------ | ------------------------------------------- |
| `NODE_ENV` | `production` | One of `development`, `test`, `production`. |
| `PORT`     | `3000`       | A valid TCP port number.                    |

An invalid value stops the service at startup with a validation error. The image carries no environment-specific values: the same image runs in dev, stage and prod, and each environment's values come from its overlay in [lab-gitops](https://github.com/CarlosFerOrduna/lab-gitops).

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

## Pipeline (planned)

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
