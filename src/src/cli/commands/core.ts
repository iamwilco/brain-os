/**
 * Core CLI commands
 * init, ingest, index, search, extract, synth, export
 */

import { Command } from 'commander';
import { resolve } from 'path';
import { initVault } from '../../vault/index.js';
import { initDatabase, closeDatabase, getDefaultDbPath } from '../../db/index.js';
import { indexSources, getIndexStats } from '../../index/index.js';
import { runExtractionPipeline, getExtractionStats } from '../../pipeline/index.js';
import {
  runWeeklySectionUpdate,
  generateAndSaveStatus,
  generateAndSaveChangelog,
} from '../../synth/index.js';
import {
  exportContextPack,
  getCitationsFromDb,
  buildCitationsIndex,
  generateCitationsMarkdown,
} from '../../export/index.js';

/** Options for the init command */
export interface InitOptions {
  vault?: string;
  force?: boolean;
}

/** Options for the ingest command */
export interface IngestOptions {
  input?: string;
  collection?: string;
}

/** Options for the index command */
export interface IndexOptions {
  scope?: string;
}

/** Options for the search command */
export interface SearchOptions {
  scope?: string;
  limit: string;
}

/** Options for the extract command */
export interface ExtractOptions {
  collection?: string;
  limit?: string;
  since?: string;
}

/** Options for the export command */
export interface ExportOptions {
  scope?: string;
  to?: string;
}

/**
 * Register core commands on the program
 */
export function registerCoreCommands(program: Command): void {
  // Init command
  program
    .command('init')
    .description('Initialize a new vault or configure an existing one')
    .option('--vault <path>', 'Path to Obsidian vault', '.')
    .option('--force', 'Overwrite existing template files')
    .action(async (options: InitOptions) => {
      const vaultPath = resolve(options.vault || '.');
      console.log(`Initializing vault at: ${vaultPath}`);
      console.log('');

      try {
        const result = await initVault({
          vaultPath,
          force: options.force,
        });

        if (result.created.length > 0) {
          console.log(`Created ${result.created.length} items:`);
          for (const item of result.created) {
            console.log(`  + ${item}`);
          }
        }

        if (result.skipped.length > 0) {
          console.log(`\nSkipped ${result.skipped.length} existing items`);
        }

        if (result.errors.length > 0) {
          console.log(`\nErrors (${result.errors.length}):`);
          for (const err of result.errors) {
            console.log(`  ! ${err.path}: ${err.error}`);
          }
          process.exitCode = 1;
        } else {
          console.log('\nVault initialized successfully!');
        }
      } catch (err) {
        console.error('Failed to initialize vault:', err);
        process.exitCode = 1;
      }
    });

  // Ingest command
  program
    .command('ingest <source>')
    .description('Ingest sources into the knowledge base (chatgpt, claude, folder)')
    .option('--input <path>', 'Input file or directory')
    .option('--collection <name>', 'Collection name for folder ingestion')
    .action(async (source: string, options: IngestOptions) => {
      console.log(`brain ingest ${source} - Not yet implemented`);
      if (options.input) console.log(`Input: ${options.input}`);
      if (options.collection) console.log(`Collection: ${options.collection}`);
    });

  // Index command
  program
    .command('index')
    .description('Build or update the search index')
    .option('--vault <path>', 'Path to vault', '.')
    .option('--scope <scope>', 'Scope to index (all, collection:<id>, path:<glob>)', 'all')
    .action(async (options: IndexOptions & { vault?: string }) => {
      const vaultPath = resolve(options.vault || '.');
      const dbPath = getDefaultDbPath(vaultPath);
      
      console.log('Building search index...');
      console.log(`Vault: ${vaultPath}`);
      console.log(`Scope: ${options.scope}`);
      console.log('');
      
      try {
        const { db } = await initDatabase(dbPath);
        
        const result = await indexSources(db, {
          vaultPath,
          scope: options.scope,
          onProgress: (progress) => {
            if (progress.phase === 'scanning') {
              process.stdout.write('\rScanning for files...');
            } else if (progress.phase === 'indexing') {
              process.stdout.write(`\rIndexing: ${progress.current}/${progress.total} - ${progress.currentFile || ''}`);
            } else if (progress.phase === 'complete') {
              process.stdout.write('\r' + ' '.repeat(80) + '\r');
            }
          },
        });
        
        console.log('Index complete!');
        console.log(`  Files scanned: ${result.filesScanned}`);
        console.log(`  Files indexed: ${result.filesIndexed}`);
        console.log(`  Files skipped: ${result.filesSkipped} (unchanged)`);
        console.log(`  Files deleted: ${result.filesDeleted} (removed from index)`);
        console.log(`  Chunks created: ${result.chunksCreated}`);
        console.log(`  Chunks deleted: ${result.chunksDeleted}`);
        console.log(`  Duration: ${result.duration}ms`);
        
        if (result.errors.length > 0) {
          console.log(`\nErrors (${result.errors.length}):`);
          for (const err of result.errors) {
            console.log(`  ! ${err.path}: ${err.error}`);
          }
        }
        
        const stats = getIndexStats(db);
        console.log(`\nIndex stats:`);
        console.log(`  Total sources: ${stats.sources}`);
        console.log(`  Total chunks: ${stats.chunks}`);
        console.log(`  Collections: ${stats.collections.join(', ') || 'none'}`);
        
        closeDatabase(db);
      } catch (err) {
        console.error('Failed to build index:', err);
        process.exitCode = 1;
      }
    });

  // Search command
  program
    .command('search <query>')
    .description('Search the knowledge base')
    .option('--scope <scope>', 'Scope to search within (path:<glob>, tag:<tag>, moc:<path>)')
    .option('--limit <n>', 'Maximum number of results', '10')
    .action(async (query: string, options: SearchOptions) => {
      console.log(`brain search "${query}" - Not yet implemented`);
      console.log(`Limit: ${options.limit}`);
      if (options.scope) console.log(`Scope: ${options.scope}`);
    });

  // Extract command
  program
    .command('extract')
    .description('Extract structured knowledge from sources')
    .option('--vault <path>', 'Path to vault', '.')
    .option('--collection <name>', 'Collection to extract from')
    .option('--limit <n>', 'Maximum sources to process')
    .option('--since <date>', 'Only process sources after this date (YYYY-MM-DD)')
    .option('--dry-run', 'Show what would be extracted without making changes')
    .action(async (options: ExtractOptions & { vault?: string; dryRun?: boolean }) => {
      const vaultPath = resolve(options.vault || '.');
      const dbPath = getDefaultDbPath(vaultPath);
      
      console.log('Extracting knowledge from sources...');
      console.log(`Vault: ${vaultPath}`);
      if (options.collection) console.log(`Collection: ${options.collection}`);
      if (options.limit) console.log(`Limit: ${options.limit}`);
      if (options.since) console.log(`Since: ${options.since}`);
      if (options.dryRun) console.log('Mode: DRY RUN');
      console.log('');
      
      try {
        const { db } = await initDatabase(dbPath);
        
        // Show current stats
        const statsBefore = getExtractionStats(db);
        console.log(`Sources: ${statsBefore.pendingSources} pending, ${statsBefore.extractedSources} extracted`);
        console.log('');
        
        const result = await runExtractionPipeline(db, {
          vaultPath,
          collection: options.collection,
          limit: options.limit ? parseInt(options.limit, 10) : undefined,
          since: options.since,
          dryRun: options.dryRun,
          onProgress: (progress) => {
            if (progress.phase === 'scanning') {
              process.stdout.write('\rScanning for sources...');
            } else if (progress.phase === 'extracting') {
              const pct = Math.round((progress.current / progress.total) * 100);
              process.stdout.write(`\rExtracting: ${progress.current}/${progress.total} (${pct}%) - ${progress.currentSource || ''}`);
            } else if (progress.phase === 'complete') {
              process.stdout.write('\r' + ' '.repeat(80) + '\r');
            }
          },
        });
        
        console.log('Extraction complete!');
        console.log(`  Sources processed: ${result.sourcesProcessed}`);
        console.log(`  Sources skipped: ${result.sourcesSkipped}`);
        console.log(`  Entities created: ${result.entitiesCreated}`);
        console.log(`  Facts created: ${result.factsCreated}`);
        console.log(`  Tasks created: ${result.tasksCreated}`);
        console.log(`  Insights created: ${result.insightsCreated}`);
        console.log(`  Entity notes: ${result.notesCreated} created, ${result.notesUpdated} updated`);
        console.log(`  Headers updated: ${result.headersUpdated}`);
        console.log(`  Duration: ${result.duration}ms`);
        
        if (result.errors.length > 0) {
          console.log(`\nErrors (${result.errors.length}):`);
          for (const err of result.errors) {
            console.log(`  ! ${err.source}: ${err.error}`);
          }
        }
        
        // Show updated stats
        const statsAfter = getExtractionStats(db);
        console.log(`\nExtraction stats:`);
        console.log(`  Total items: ${statsAfter.totalItems}`);
        for (const [type, count] of Object.entries(statsAfter.itemsByType)) {
          console.log(`    ${type}: ${count}`);
        }
        
        closeDatabase(db);
      } catch (err) {
        console.error('Failed to run extraction:', err);
        process.exitCode = 1;
      }
    });

  // Synth command
  program
    .command('synth <type>')
    .description('Run synthesis operations (daily, weekly)')
    .option('--vault <path>', 'Path to vault', '.')
    .action(async (type: string, options: { vault?: string }) => {
      const vaultPath = resolve(options.vault || '.');
      const dbPath = getDefaultDbPath(vaultPath);
      
      if (type !== 'weekly' && type !== 'daily') {
        console.error(`Unknown synth type: ${type}. Use 'weekly' or 'daily'.`);
        process.exitCode = 1;
        return;
      }
      
      console.log(`Running ${type} synthesis...`);
      console.log(`Vault: ${vaultPath}`);
      console.log('');
      
      try {
        const { db } = await initDatabase(dbPath);
        
        if (type === 'weekly') {
          // Step 1: Update hot/warm/cold sections
          console.log('Step 1/3: Updating entity note sections...');
          const sectionResult = await runWeeklySectionUpdate(vaultPath, db, (current, total, name) => {
            process.stdout.write(`\r  Processing: ${current}/${total} - ${name || ''}`);
          });
          process.stdout.write('\r' + ' '.repeat(60) + '\r');
          console.log(`  Notes updated: ${sectionResult.notesUpdated}`);
          console.log(`  Items moved: ${sectionResult.itemsMoved}`);
          
          // Step 2: Generate status snapshot
          console.log('\nStep 2/3: Generating status snapshot...');
          const statusResult = await generateAndSaveStatus(vaultPath, db);
          if (statusResult) {
            console.log(`  Status saved to: ${statusResult.path}`);
            console.log(`  Progress: ${statusResult.status.summary.completionPercentage}%`);
            console.log(`  Open tasks: ${statusResult.status.openTasks.length}`);
            console.log(`  Blockers: ${statusResult.status.blockers.length}`);
          }
          
          // Step 3: Generate changelog
          console.log('\nStep 3/3: Generating changelog...');
          const changelogResult = await generateAndSaveChangelog(vaultPath, db);
          console.log(`  Changelog saved to: ${changelogResult.path}`);
          console.log(`  Highlights:`);
          for (const highlight of changelogResult.report.highlights.slice(0, 5)) {
            console.log(`    - ${highlight}`);
          }
          
          console.log('\nWeekly synthesis complete!');
          
          if (sectionResult.errors.length > 0) {
            console.log(`\nWarnings (${sectionResult.errors.length}):`);
            for (const err of sectionResult.errors.slice(0, 5)) {
              console.log(`  ! ${err.note}: ${err.error}`);
            }
          }
        } else {
          // Daily synth - lighter weight
          console.log('Daily synthesis: generating changelog only...');
          const changelogResult = await generateAndSaveChangelog(vaultPath, db);
          console.log(`Changelog saved to: ${changelogResult.path}`);
          for (const highlight of changelogResult.report.highlights) {
            console.log(`  - ${highlight}`);
          }
          console.log('\nDaily synthesis complete!');
        }
        
        closeDatabase(db);
      } catch (err) {
        console.error('Failed to run synthesis:', err);
        process.exitCode = 1;
      }
    });

  // Export command
  program
    .command('export <type>')
    .description('Export knowledge (context-pack)')
    .option('--vault <path>', 'Path to vault', '.')
    .option('--scope <scope>', 'Scope to export', 'all')
    .option('--to <path>', 'Destination path')
    .option('--include-citations', 'Include citations file')
    .option('--max-files <n>', 'Maximum files to include')
    .option('--max-size <kb>', 'Maximum size in KB')
    .action(async (type: string, options: ExportOptions & { 
      vault?: string; 
      includeCitations?: boolean;
      maxFiles?: string;
      maxSize?: string;
    }) => {
      if (type !== 'context-pack') {
        console.error(`Unknown export type: ${type}. Use 'context-pack'.`);
        process.exitCode = 1;
        return;
      }
      
      const vaultPath = resolve(options.vault || '.');
      const outputPath = options.to ? resolve(options.to) : resolve(vaultPath, 'context-pack');
      
      console.log('Exporting context pack...');
      console.log(`Vault: ${vaultPath}`);
      console.log(`Output: ${outputPath}`);
      console.log(`Scope: ${options.scope || 'all'}`);
      console.log('');
      
      try {
        // Export context pack
        const result = await exportContextPack(vaultPath, outputPath, {
          scope: options.scope,
          maxFiles: options.maxFiles ? parseInt(options.maxFiles, 10) : undefined,
          maxSizeKb: options.maxSize ? parseInt(options.maxSize, 10) : undefined,
        });
        
        console.log('Export complete!');
        console.log(`  Files: ${result.manifest.totalFiles}`);
        console.log(`  Size: ${formatSize(result.manifest.totalSize)}`);
        
        // Include citations if requested
        if (options.includeCitations) {
          console.log('\nGenerating citations...');
          const dbPath = getDefaultDbPath(vaultPath);
          const { db } = await initDatabase(dbPath);
          
          const sourcePaths = result.manifest.files.map(f => f.sourcePath);
          const citations = getCitationsFromDb(db, sourcePaths);
          const index = buildCitationsIndex(citations);
          const citationsMarkdown = generateCitationsMarkdown(index);
          
          const { writeFile } = await import('fs/promises');
          const { join } = await import('path');
          await writeFile(join(outputPath, 'CITATIONS.md'), citationsMarkdown, 'utf-8');
          
          console.log(`  Citations: ${index.totalCitations}`);
          closeDatabase(db);
        }
        
        if (result.errors.length > 0) {
          console.log(`\nWarnings (${result.errors.length}):`);
          for (const err of result.errors.slice(0, 5)) {
            console.log(`  ! ${err.file}: ${err.error}`);
          }
        }
        
        console.log(`\nContext pack ready at: ${outputPath}`);
        console.log('Files:');
        console.log('  - manifest.json');
        console.log('  - README.md');
        if (options.includeCitations) {
          console.log('  - CITATIONS.md');
        }
        console.log(`  - ${result.manifest.totalFiles} content files`);
        
      } catch (err) {
        console.error('Failed to export context pack:', err);
        process.exitCode = 1;
      }
    });
}

/**
 * Format bytes for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
