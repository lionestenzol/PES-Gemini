import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { globalPesEngine } from './src/lib/pes-engine.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Support both /v1/... (PES Path E standard) and /api/v1/...
  const apiRouter = express.Router();

  // Health
  apiRouter.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', api_version: 'v1', time: new Date().toISOString() });
  });

  // Commitments
  apiRouter.get('/commitments', (req: Request, res: Response) => {
    try {
      const cards = globalPesEngine.getCards();
      res.json({ ok: true, data: cards });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.get('/commitments/:id', (req: Request, res: Response) => {
    try {
      const card = globalPesEngine.getCard(req.params.id);
      if (!card) {
        return res.status(404).json({ ok: false, error: `Card ${req.params.id} not found` });
      }
      res.json({ ok: true, data: card });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/commitments', (req: Request, res: Response) => {
    try {
      const card = globalPesEngine.createCard(req.body);
      res.status(201).json({ ok: true, data: card });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.patch('/commitments/:id', (req: Request, res: Response) => {
    try {
      const updated = globalPesEngine.updateCard(req.params.id, req.body);
      res.json({ ok: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/commitments/:id/move', (req: Request, res: Response) => {
    try {
      const { target, ...facts } = req.body;
      if (!target) {
        return res.status(400).json({ ok: false, error: 'target state is required' });
      }
      const moved = globalPesEngine.moveCard(req.params.id, target, facts);
      res.json({ ok: true, data: moved });
    } catch (err: any) {
      res.status(409).json({ ok: false, error: err.message });
    }
  });

  // Views (Path E standard views: inbox, ready, active, verify, blocked, records)
  apiRouter.get('/views/:name', (req: Request, res: Response) => {
    try {
      const view = req.params.name.toLowerCase();
      const all = globalPesEngine.getCards();
      let filtered = all;

      if (view === 'inbox') filtered = all.filter((c) => c.state === 'Captured');
      else if (view === 'ready') filtered = all.filter((c) => c.state === 'Ready');
      else if (view === 'active') filtered = all.filter((c) => c.state === 'Active');
      else if (view === 'verify') filtered = all.filter((c) => c.state === 'Completed');
      else if (view === 'blocked') filtered = all.filter((c) => c.state === 'Blocked');
      else if (view === 'records') filtered = all.filter((c) => ['Done', 'Canceled'].includes(c.state));

      res.json({ ok: true, view, data: filtered });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Capacity
  apiRouter.get('/capacity', (req: Request, res: Response) => {
    try {
      const records = globalPesEngine.getCapacityRecords();
      res.json({ ok: true, data: records });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.get('/capacity/:week', (req: Request, res: Response) => {
    try {
      const cap = globalPesEngine.getCapacity(req.params.week);
      res.json({ ok: true, data: cap });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/capacity', (req: Request, res: Response) => {
    try {
      const cap = globalPesEngine.setCapacity(req.body);
      res.json({ ok: true, data: cap });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Inbox
  apiRouter.get('/inbox', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: globalPesEngine.getInbox() });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/inbox', (req: Request, res: Response) => {
    try {
      const item = globalPesEngine.addInboxItem(req.body.text || req.body.raw_text);
      res.status(201).json({ ok: true, data: item });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/inbox/:id/process', (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { action, cardData } = req.body;
      const result = globalPesEngine.processInboxItem(id, action, cardData);
      res.json({ ok: true, data: result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Proof Index
  apiRouter.get('/proof', (req: Request, res: Response) => {
    try {
      const cardId = req.query.card_id as string | undefined;
      res.json({ ok: true, data: globalPesEngine.getProofIndex(cardId) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/proof/:id/verify', (req: Request, res: Response) => {
    try {
      const verified = globalPesEngine.verifyProof(req.params.id);
      res.json({ ok: true, data: verified });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Audit Logs
  apiRouter.get('/log', (req: Request, res: Response) => {
    try {
      const cardId = req.query.card_id as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      res.json({ ok: true, data: globalPesEngine.getLogs(cardId, limit) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Mount API routers
  app.use('/v1', apiRouter);
  app.use('/api/v1', apiRouter);

  // Vite middleware in development vs static file serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PES] Engine listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[PES] Failed to start server:', err);
  process.exit(1);
});
