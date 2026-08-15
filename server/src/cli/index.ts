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
    console.log('TRACE');
    console.log('Production observation system');
    console.log('');
    console.log('Target:');
    console.log(url);
    console.log('');
    console.log('Status:');
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
    console.log('\n');
    console.log('SCAN COMPLETED');
    console.log('URL');
    console.log(result.scan.url);
    console.log(`pages discovered: ${result.summary.pagesDiscovered}`);
    console.log(`network requests: ${result.summary.requestsObserved}`);
    console.log(`console observations: ${result.summary.consoleEvents}`);
    console.log(`runtime errors: ${result.summary.runtimeErrors}`);
    console.log(`accessibility findings: ${result.summary.accessibilityViolations}`);
    console.log(`security findings: ${result.summary.securityFindings}`);
    console.log(`performance: LCP=${result.performance.lcp} FCP=${result.performance.fcp} TTFB=${result.performance.ttfb}`);
    console.log(`health score: ${result.scores.overall} / 100`);
    console.log(`scan duration: ${result.scan.durationMs}ms`);
    console.log('');
    console.log(`Pages: ${result.summary.pagesScanned}`);
    console.log(`Requests: ${result.summary.requestsObserved}`);
    console.log(`Console: ${result.summary.consoleEvents}`);
    console.log(`Runtime: ${result.summary.runtimeErrors}`);
    console.log(`Network: ${result.summary.networkFailures}`);
    console.log(`Accessibility: ${result.summary.accessibilityViolations}`);
    console.log(`Security: ${result.summary.securityFindings}`);
    console.log(`Health: ${result.scores.overall} / 100`);
    console.log(`TRACE observed ${result.summary.requestsObserved} network/API requests during this scan.`);
    console.log(`Report: ${artifacts.htmlPath}`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
