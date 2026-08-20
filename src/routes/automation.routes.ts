import {
  cancelAgentRun,
  getActiveAgentRun,
  getAgentRun,
  getAutomationPolicy,
  getAutomationSummary,
  listAgentRuns,
  resumeAgentRun,
  runAutomationNow,
  updateAutomationPolicy,
} from '@/controllers/automation.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import {
  CancelAgentRunSchema,
  GetActiveAgentRunSchema,
  GetAgentRunSchema,
  GetAutomationPolicySchema,
  GetAutomationSummarySchema,
  ListAgentRunsSchema,
  ResumeAgentRunSchema,
  RunAutomationNowSchema,
  UpdateAutomationPolicySchema,
} from '@/schemas/requests/automation.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['automation'];

export async function automationRoutes(app: FastifyInstance) {
  app.get(
    '/automation/policy',
    { schema: { ...GetAutomationPolicySchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAutomationPolicy)
  );

  app.patch(
    '/automation/policy',
    { schema: { ...UpdateAutomationPolicySchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(updateAutomationPolicy)
  );

  app.get(
    '/automation/runs',
    { schema: { ...ListAgentRunsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listAgentRuns)
  );

  app.get(
    '/automation/active',
    { schema: { ...GetActiveAgentRunSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getActiveAgentRun)
  );

  app.get(
    '/automation/runs/:id',
    { schema: { ...GetAgentRunSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAgentRun)
  );

  app.post(
    '/automation/runs/:id/resume',
    { schema: { ...ResumeAgentRunSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(resumeAgentRun)
  );

  app.post(
    '/automation/runs/:id/cancel',
    { schema: { ...CancelAgentRunSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(cancelAgentRun)
  );

  app.get(
    '/automation/summary',
    { schema: { ...GetAutomationSummarySchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAutomationSummary)
  );

  app.post(
    '/automation/run',
    { schema: { ...RunAutomationNowSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(runAutomationNow)
  );
}
