// Copyright (c) 2026 dotandev
// SPDX-License-Identifier: MIT OR Apache-2.0

import { Command } from 'commander';
import { ProtocolHandler } from '../protocol/handler';
import { ProtocolRegistrar } from '../protocol/register';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Load environment variables for security configuration
dotenv.config();

const LOCK_FILE = path.join(os.tmpdir(), 'glassbox-protocol-handler.lock');
const LOCK_STALE_MS = 30_000;

function acquireLock(force: boolean): boolean {
    if (force) {
        writeLock();
        return true;
    }

    try {
        const stat = fs.statSync(LOCK_FILE);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
            writeLock();
            return true;
        }
        return false;
    } catch {
        writeLock();
        return true;
    }
}

function writeLock(): void {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: 'w' });
}

function releaseLock(): void {
    try {
        fs.unlinkSync(LOCK_FILE);
    } catch {
        // Lock already removed — no action needed.
    }
}

/**
 * registerProtocolCommands adds protocol-related commands to the Glassbox CLI.
 * These include the internal handler called by the OS and user-facing 
 * registration commands.
 */
export function registerProtocolCommands(program: Command): void {
    // 1. Internal Protocol Handler (hidden from standard help via description)
    program
        .command('protocol-handler <uri>')
        .description('Internal: Handle GLASSBOX Protocol URI (invoked by OS)')
        .option('--force', 'Bypass the concurrency lock')
        .action(async (uri: string, opts: { force?: boolean }) => {
            if (!acquireLock(opts.force === true)) {
                console.error('[WARN] Another protocol handler instance is running. Use --force to override.');
                process.exit(1);
            }

            const cleanup = (): void => { releaseLock(); };
            process.on('exit', cleanup);
            process.on('SIGINT', () => { cleanup(); process.exit(130); });
            process.on('SIGTERM', () => { cleanup(); process.exit(143); });

            try {
                const handler = new ProtocolHandler({
                    secret: process.env.GLASSBOX_PROTOCOL_SECRET,
                    trustedOrigins: process.env.GLASSBOX_TRUSTED_ORIGINS?.split(','),
                });

                await handler.handle(uri);
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`[FAIL] Protocol handler error: ${error.message}`);
                } else {
                    console.error('[FAIL] Protocol handler error: An unknown error occurred');
                }
                process.exit(1);
            } finally {
                releaseLock();
            }
        });

    // 2. Protocol Registration
    program
        .command('protocol:register')
        .description('Register the glassbox:// protocol handler in the operating system')
        .action(async () => {
            try {
                const registrar = new ProtocolRegistrar();

                const isRegistered = await registrar.isRegistered();
                if (isRegistered) {
                    console.log('[WARN]  Protocol handler is already registered.');
                    console.log('To refresh registration, run: GLASSBOX Protocol:unregister && GLASSBOX Protocol:register');
                    return;
                }

                await registrar.register();
                console.log(' Successfully registered GLASSBOX Protocol handler');
                console.log('You can now launch Glassbox directly from supported dashboards via glassbox:// links.');
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`[FAIL] Registration failed: ${error.message}`);
                } else {
                    console.error('[FAIL] Registration failed: An unknown error occurred');
                }
                process.exit(1);
            }
        });

    // 3. Protocol Unregistration
    program
        .command('protocol:unregister')
        .description('Unregister the glassbox:// protocol handler from the operating system')
        .action(async () => {
            try {
                const registrar = new ProtocolRegistrar();
                await registrar.unregister();
                console.log(' Successfully unregistered GLASSBOX Protocol handler');
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`[FAIL] Unregistration failed: ${error.message}`);
                } else {
                    console.error('[FAIL] Unregistration failed: An unknown error occurred');
                }
                process.exit(1);
            }
        });

    // 4. Registration Status
    program
        .command('protocol:status')
        .description('Check current registration status of the glassbox:// protocol handler')
        .action(async () => {
            try {
                const registrar = new ProtocolRegistrar();
                const diag = await registrar.diagnose();
                const executableFix = process.platform === 'win32'
                    ? 'Ensure the registered file is a runnable .exe, .cmd, .bat, or .com binary'
                    : `Restore execute permissions, for example: chmod +x ${diag.cliPath ?? '<path>'}`;

                console.log('GLASSBOX Protocol Handler Status');
                console.log('----------------------------');
                console.log(`Registered Path: ${diag.cliPath ?? '(not registered)'}`);

                if (!diag.registered) {
                    console.log('Registration:    NOT REGISTERED');
                    console.log('Path Exists:     No');
                    console.log('Executable:      No');
                    console.log('');
                    console.log('Fix:');
                    console.log('  - Run "GLASSBOX Protocol:register" to enable dashboard integration');
                    return;
                }

                console.log('Registration:    REGISTERED');
                console.log(`Path Exists:     ${diag.pathExists ? 'Yes' : 'No'}`);
                console.log(`Executable:      ${!diag.pathExists ? 'No' : diag.isExecutable ? 'Yes' : 'No'}`);

                const issues: string[] = [];
                const fixes: string[] = [];

                if (!diag.cliPath) {
                    issues.push('Could not determine registered CLI path');
                    fixes.push('Re-run "GLASSBOX Protocol:register" to refresh registration');
                } else if (!diag.pathExists) {
                    issues.push(`Binary not found at ${diag.cliPath}`);
                    fixes.push(`Ensure the Glassbox binary exists at ${diag.cliPath}`);
                    fixes.push('Re-run "GLASSBOX Protocol:register" to update the registered path');
                } else if (!diag.isExecutable) {
                    issues.push(`Binary at ${diag.cliPath} is not executable`);
                    fixes.push(executableFix);
                    fixes.push('Re-run "GLASSBOX Protocol:register" if the binary moved or was replaced');
                }

                if (issues.length === 0) {
                    console.log('[OK] Registered CLI is usable.');
                    return;
                }

                console.log('');
                for (const issue of issues) {
                    console.log(`[FAIL] ${issue}`);
                }
                console.log('');
                console.log('Fix:');
                for (const fix of fixes) {
                    console.log(`  - ${fix}`);
                }
            } catch (error) {
                if (error instanceof Error) {
                    console.error(`[FAIL] Status check failed: ${error.message}`);
                } else {
                    console.error('[FAIL] Status check failed: An unknown error occurred');
                }
                process.exit(1);
            }
        });
}
