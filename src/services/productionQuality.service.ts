import { ApprovalStage, Prisma, QualityVerdict } from '@prisma/client';
import { NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { productionRepository } from '@/repositories/production.repository';
import { getMediaEngineClient } from '@/studio/engines/media.client';
import { qualityThresholdsFor } from '@/studio/engines/render-profiles';
import type { QualityReport } from '@/studio/contracts';

const VERDICT_MAP: Record<QualityReport['verdict'], QualityVerdict> = {
  passed: 'PASSED',
  warning: 'WARNING',
  failed: 'FAILED',
};

export class ProductionQualityService {
  async inspectMaster(productionId: string): Promise<QualityReport> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const outputs = await productionJobRepository.renderOutputs(productionId, 'master');
    const master = outputs[0];
    if (!master) {
      throw new NotFoundError('this production has no master render');
    }

    const report = await getMediaEngineClient().inspect({
      target: 'master',
      target_id: productionId,
      video_key: master.storageKey,
      expected_duration_seconds: master.durationSeconds,
      thresholds: qualityThresholdsFor('LANDSCAPE_16_9', master.durationSeconds),
    });

    await this.record(productionId, report);
    return report;
  }

  async inspectVariants(productionId: string): Promise<QualityReport[]> {
    const variants = await productionJobRepository.variants(productionId);
    const reports: QualityReport[] = [];

    for (const variant of variants) {
      if (!variant.storageKey || !variant.renderOutput) {
        continue;
      }
      const report = await getMediaEngineClient().inspect({
        target: 'variant',
        target_id: variant.id,
        video_key: variant.storageKey,
        expected_duration_seconds: variant.renderOutput.durationSeconds,
        thresholds: qualityThresholdsFor(variant.format, variant.renderOutput.durationSeconds),
      });
      await this.record(productionId, report);
      reports.push(report);
    }

    return reports;
  }

  async record(productionId: string, report: QualityReport) {
    return productionJobRepository.recordQualityCheck({
      productionId,
      target: report.target,
      targetId: report.target_id ?? null,
      verdict: VERDICT_MAP[report.verdict],
      checks: report.checks as unknown as Prisma.InputJsonValue,
      failures: report.failures,
      warnings: report.warnings,
      metadata: (report.probe ?? {}) as Prisma.InputJsonValue,
    });
  }

  async gate(productionId: string): Promise<{ approved: boolean; failures: string[] }> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const verdicts = await productionJobRepository.qualityVerdicts(productionId);
    const failures = Object.entries(verdicts)
      .filter(([, verdict]) => verdict === 'FAILED')
      .map(([target]) => target);

    if (failures.length > 0) {
      logger.warn({ productionId, failures }, 'studio.quality.rejected');
      await productionRepository.recordEvent({
        productionId,
        event: 'quality.rejected',
        fromStatus: production.status,
        toStatus: 'QUALITY_CHECK',
        payload: { failures } as Prisma.InputJsonValue,
      });
      return { approved: false, failures };
    }

    if (production.autoApprove) {
      await productionRepository.upsertApproval(productionId, 'FINAL_VIDEO', 'APPROVED', 'auto');
      return { approved: true, failures: [] };
    }

    await productionRepository.upsertApproval(productionId, 'FINAL_VIDEO', 'PENDING');
    return { approved: false, failures: [] };
  }

  async awaitingApproval(productionId: string, stage: ApprovalStage): Promise<boolean> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }
    if (production.autoApprove) {
      return false;
    }
    const approvals = await productionRepository.approvals(productionId);
    const approval = approvals.find(entry => entry.stage === stage);
    return !approval || approval.decision !== 'APPROVED';
  }
}

export const productionQualityService = new ProductionQualityService();
