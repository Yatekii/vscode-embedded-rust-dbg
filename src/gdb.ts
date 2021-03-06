import * as cp from 'child_process';
import { Readable } from 'stream';
import * as util from './util';

export async function spawnDebugAdapter(
    executable: string,
    args: string[],
    env: util.Environment,
    cwd: string
): Promise<cp.ChildProcess> {
    return cp.spawn(executable, args, {
		detached: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env,
        cwd: cwd
    });
}

export async function getDebugServerPort(adapter: cp.ChildProcess): Promise<number> {
    let regex = new RegExp('^For help', 'm');
    let match = await waitForPattern(adapter, adapter.stdout, regex);
    return parseInt(match[1]);
}

/**
 * Looks for a specific pattern in a stream and returns the matched contents if it was found.
 * Kills the process if the `timeout` is reached.
 * @param process The child process which is expected to emmit a certain pattern.
 * @param channel The channel stream on which the pattern is expected.
 * @param pattern A RegExp pattern which the channel has to match.
 * @param timeoutMillis A timeout after which the child process is killed if the pattern was not found.
 */
export function waitForPattern(
    process: cp.ChildProcess,
    channel: Readable,
    pattern: RegExp,
    timeoutMillis = 5000
): Promise<RegExpExecArray> {
    return new Promise<RegExpExecArray>((resolve, reject) => {
        let promisePending = true;
        let processOutput = '';
        // Wait for expected pattern in channel.
        channel.on('data', chunk => {
            let chunkStr = chunk.toString();
            if (promisePending) {
                processOutput += chunkStr;
                let match = pattern.exec(processOutput);
                if (match) {
                    clearTimeout(timer);
                    processOutput = '';
                    promisePending = false;
                    resolve(match);
                }
            }
        });
        // On spawn error.
        process.on('error', err => {
            promisePending = false;
            reject(err);
        });
        // Bail if LLDB does not start within the specified timeout.
        let timer = setTimeout(() => {
            if (promisePending) {
                process.kill();
                let err = Error('The debugger did not start within the allotted time.');
                (<any>err).code = 'Timeout';
                (<any>err).stdout = processOutput;
                promisePending = false;
                reject(err);
            }
        }, timeoutMillis);
        // Premature exit.
        process.on('exit', (code, signal) => {
            if (promisePending) {
                let err = Error('The debugger exited without completing startup handshake.');
                (<any>err).code = 'Handshake';
                (<any>err).stdout = processOutput;
                promisePending = false;
                reject(err);
            }
        });
    });
}