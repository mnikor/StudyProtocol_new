# FastAPI Backend

This backend is the durable persistence foundation for the React protocol app.

Local run:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
npm run dev:api
npm run dev:react
```

By default, local data is stored in `backend/data/app.db`. In Railway or any production environment, set `DATABASE_URL` to a Postgres connection string.

Current scope:

- Protocol/project list, create, read, update, delete
- Design state persistence
- Component persistence
- Comment persistence
- React static serving after `npm run build`

The existing Express backend still contains most AI generation endpoints. Those can be migrated endpoint-by-endpoint after the FastAPI persistence path is stable.
