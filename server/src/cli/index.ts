import { Command } from 'commander';
import { randomUUID } from 'node:crypto';
import { assertSafeUrl } from '../security/ssrf.ts';
import { runScanEngine } from '../scanner/engine.ts';
import { writeArtifacts } from '../artifacts/write.ts';
import { config } from '../config.ts';

const program = new Command();

program.name('trace').description('TRACE production observation system');

program
  .command('scan')
  .argument('<url>')
  .option('--max-pages <n>', 'max pages', String(config.scanMaxPages))
  .option('--device <device>', 'mobile|desktop', 'mobile')
  .action(async (url: string, opts: { maxPages: string; device: string }) => {
    console.log('console.trace');
    console.log('');
    console.log('TARGET');
    console.log(url);
    console.log('');
    console.log('STATUS');
    console.log('SCANNING');
    const normalized = await assertSafeUrl(url, { allowLocal: config.allowLocalTargets });
    const scanId = randomUUID();
    const result = await runScanEngine({
      scanId,
      url: normalized,
      options: {
        maxPages: Number(opts.maxPages) || 5,
        device: opts.device === 'desktop' ? 'desktop' : 'mobile',
        accessibility: true,
        performance: true,
        security: true,
        interactions: false,
      },
      onProgress: (status) => {
        process.stdout.write(`\rStatus: ${status}          `);
      },
    });
    const artifacts = await writeArtifacts(scanId, result, { persistDb: false });
    console.log('');
    console.log('STATUS');
    console.log(result.scan.status.toUpperCase());
    console.log('');
    console.log('PAGES');
    console.log(result.summary.pagesScanned);
    console.log('');
    console.log('REQUESTS');
    console.log(result.summary.requestsObserved);
    console.log('');
    console.log('CONSOLE');
    console.log(result.summary.consoleEvents);
    console.log('');
    console.log('RUNTIME');
    console.log(result.summary.runtimeErrors);
    console.log('');
    console.log('NETWORK');
    console.log(result.summary.networkFailures);
    console.log('');
    console.log('ACCESSIBILITY');
    console.log(result.summary.accessibilityViolations);
    console.log('');
    console.log('SECURITY');
    console.log(result.summary.securityFindings);
    console.log('');
    console.log('PERFORMANCE');
    console.log(`LCP=${result.performance.lcp} FCP=${result.performance.fcp} TTFB=${result.performance.ttfb}`);
    console.log('');
    console.log('HEALTH');
    console.log(`${result.scores.overall} / 100`);
    console.log('');
    console.log(`TRACE observed ${result.summary.requestsObserved} network/API requests during this scan.`);
    console.log(`Report: ${artifacts.htmlPath}`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
