import {
  buildDeploymentReadinessReport,
  requiredDeploymentEnvKeys,
} from './deployment-readiness-check';

const requiredRoutes = [
  'POST /api/notifications/telegram/test',
  'GET /api/system/status',
  'GET /api/onboarding/current',
  'POST /api/onboarding/reply',
  'POST /api/goals/start',
  'GET /api/curriculum/map',
  'GET /api/lesson/current',
] as const;

export function buildPhase1SmokeReport(env: Record<string, string | undefined>) {
  const deployment = buildDeploymentReadinessReport(env);

  return {
    passed: deployment.ready,
    routeCount: requiredRoutes.length,
    requiredRoutes: [...requiredRoutes],
    requiredEnvCount: requiredDeploymentEnvKeys.length,
    missingEnv: deployment.missing,
  };
}

const report = buildPhase1SmokeReport(process.env);

console.log('LRNR Phase 1 smoke gate');
console.log(`passed=${report.passed}`);
console.log(`routes=${report.requiredRoutes.join(', ')}`);

if (!report.passed) {
  console.log(`missingEnv=${report.missingEnv.join(', ')}`);
}

process.exitCode = report.passed ? 0 : 1;
