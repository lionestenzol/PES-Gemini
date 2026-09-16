import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { globalPesEngine, DEFAULT_USERS, getMondayOfWeek } from './src/lib/pes-engine.ts';
import { PathDSolver } from './src/lib/path-d-solver.ts';
import { globalPesV2Engine, MASTER_PROMPT_INDEX } from './src/lib/pes-v2-engine.ts';
import {
  askUniversalAgent,
  sortTheLineWithAi,
  diagnoseAndRerouteStuck,
} from './server/gemini-agent.ts';

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
      const { target, actor, actor_role, ...facts } = req.body;
      if (!target) {
        return res.status(400).json({ ok: false, error: 'target state is required' });
      }
      const moved = globalPesEngine.moveCard(req.params.id, target, {
        ...facts,
        actor,
        actor_role,
      });
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
      const { actor, actor_role } = req.body;
      const verified = globalPesEngine.verifyProof(req.params.id, actor, actor_role);
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

  // Users & Roles (Path C)
  apiRouter.get('/users', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: DEFAULT_USERS });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Links & Dependencies
  apiRouter.get('/links', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: globalPesEngine.getLinks() });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/links', (req: Request, res: Response) => {
    try {
      const link = globalPesEngine.addLink(req.body);
      res.status(201).json({ ok: true, data: link });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.delete('/links/:from_id/:to_id', (req: Request, res: Response) => {
    try {
      const deleted = globalPesEngine.deleteLink(req.params.from_id, req.params.to_id);
      res.json({ ok: true, deleted });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Optimizer & Fixed Events (Path D)
  apiRouter.get('/optimizer/fixed-events', (req: Request, res: Response) => {
    try {
      const weekOf = req.query.week_of as string | undefined;
      res.json({ ok: true, data: globalPesEngine.getFixedEvents(weekOf) });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/optimizer/fixed-events', (req: Request, res: Response) => {
    try {
      const event = globalPesEngine.addFixedEvent(req.body);
      res.status(201).json({ ok: true, data: event });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.delete('/optimizer/fixed-events/:id', (req: Request, res: Response) => {
    try {
      const deleted = globalPesEngine.deleteFixedEvent(req.params.id);
      res.json({ ok: true, deleted });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/optimizer/solve', (req: Request, res: Response) => {
    try {
      const weekOf = req.body.week_of || (req.query.week_of as string) || getMondayOfWeek(new Date());
      const whatIf = req.body.what_if;

      const cards = globalPesEngine.getCards();
      const capacity = globalPesEngine.getCapacity(weekOf);
      const links = globalPesEngine.getLinks();
      const fixedEvents = globalPesEngine.getFixedEvents(weekOf);

      const proposal = PathDSolver.solve(weekOf, cards, capacity, links, fixedEvents, whatIf);
      res.json({ ok: true, data: proposal });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/optimizer/import', (req: Request, res: Response) => {
    try {
      const { proposal, actor, actor_role } = req.body;
      if (!proposal || !proposal.blocks) {
        return res.status(400).json({ ok: false, error: 'A valid optimizer proposal is required' });
      }
      const result = globalPesEngine.importProposal(proposal, actor, actor_role);
      res.json({ ok: true, data: result });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // RFC 5545 Calendar ICS Export
  apiRouter.get('/calendar/export.ics', (req: Request, res: Response) => {
    try {
      const weekOf = req.query.week_of as string | undefined;
      const ics = globalPesEngine.generateIcsCalendar(weekOf);
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="pes-schedule.ics"');
      res.send(ics);
    } catch (err: any) {
      res.status(500).send(`Error generating ICS calendar: ${err.message}`);
    }
  });

  // ==========================================
  // PES V2 Transformation Architecture Routes
  // ==========================================

  // Compartment 1: Intake & Validation
  apiRouter.get('/v2/intake', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: globalPesV2Engine.getIntakeRecord() });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/v2/intake/parse', (req: Request, res: Response) => {
    try {
      const { rawInput } = req.body;
      const record = globalPesV2Engine.processRawIntent(rawInput || '');
      res.json({ ok: true, data: record });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Compartment 2: Knowledge & Resources
  apiRouter.get('/v2/knowledge-resources', (req: Request, res: Response) => {
    try {
      res.json({
        ok: true,
        data: {
          knowledgeEntities: globalPesV2Engine.getKnowledgeEntities(),
          resourceEntities: globalPesV2Engine.getResourceEntities(),
          dependencyMatrix: globalPesV2Engine.getDependencyMatrix(),
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Compartment 3: Structural Evolution
  apiRouter.get('/v2/pipeline-structure', (req: Request, res: Response) => {
    try {
      res.json({
        ok: true,
        data: {
          listItems: globalPesV2Engine.getListItems(),
          treeNodes: globalPesV2Engine.getTreeNodes(),
          dependencyNodes: globalPesV2Engine.getDependencyNodes(),
          bpmnElements: globalPesV2Engine.getBpmnElements(),
        },
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Compartment 3: Tickets & Middle Box Execution
  apiRouter.get('/v2/tickets', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: globalPesV2Engine.getTickets() });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/v2/tickets/:id/execute', (req: Request, res: Response) => {
    try {
      const ticket = globalPesV2Engine.executeTicket(req.params.id);
      res.json({ ok: true, data: ticket });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/v2/tickets/:id/verify', (req: Request, res: Response) => {
    try {
      const { isValid } = req.body;
      const ticket = globalPesV2Engine.verifyTicketProof(req.params.id, isValid !== false);
      res.json({ ok: true, data: ticket });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/v2/tickets/:id/fail', (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const tt = globalPesV2Engine.triggerFailureAndTroubleshoot(req.params.id, reason || 'Manual failure trigger');
      res.json({ ok: true, data: tt });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/v2/troubleshooting/:id/resolve', (req: Request, res: Response) => {
    try {
      const { reEntry } = req.body;
      globalPesV2Engine.resolveTroubleshootingTicket(req.params.id, reEntry !== false);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ ok: false, error: err.message });
    }
  });

  // Compartment 0: Master Prompt Architecture & Index
  apiRouter.get('/v2/prompt-index', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: MASTER_PROMPT_INDEX });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Compartment 4: Terminal JSON Payload
  apiRouter.get('/v2/terminal-payload', (req: Request, res: Response) => {
    try {
      res.json({ ok: true, data: globalPesV2Engine.generateTerminalJsonPayload() });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Universal Agent & The Line & The Stuck Feature (Gemini API)
  apiRouter.post('/agent/chat', async (req: Request, res: Response) => {
    try {
      const { message, history, contextData } = req.body;
      if (!message) {
        return res.status(400).json({ ok: false, error: 'message is required' });
      }
      const reply = await askUniversalAgent(message, history || [], contextData);
      res.json({ ok: true, reply });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/agent/sort-line', async (req: Request, res: Response) => {
    try {
      const { items, customPrompt } = req.body;
      const result = await sortTheLineWithAi(items || [], customPrompt);
      res.json({ ok: true, data: result });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  apiRouter.post('/agent/stuck', async (req: Request, res: Response) => {
    try {
      const { blockerDescription, currentContext } = req.body;
      if (!blockerDescription) {
        return res.status(400).json({ ok: false, error: 'blockerDescription is required' });
      }
      const diagnosis = await diagnoseAndRerouteStuck(blockerDescription, currentContext);
      res.json({ ok: true, data: diagnosis });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // Direct /api/agent shortcuts
  app.use('/api', apiRouter);

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
